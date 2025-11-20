/*
  # Lane Boundary Enforcement Infrastructure

  This migration creates tables and functions to enforce strict lane boundaries
  between different interaction modes (chat, recruiting, sports) with schema
  validation and contamination detection.

  ## Tables Created

  1. lane_contexts
     - Defines valid context shapes for each mode
     - Stores JSON schemas for required/forbidden fields
     - Enables compile-time validation of context objects

  2. lane_transitions
     - Logs every mode switch
     - Captures context snapshots before/after transitions
     - Tracks data sanitization performed

  3. cross_lane_contamination_alerts
     - Flags when data from one lane appears in another
     - Enables detection of context leakage
     - Supports debugging and security auditing

  ## Security
  - All tables have RLS enabled
  - Lane definitions are global (managed by service role)
  - User transition logs are user-specific

  ## Performance
  - Indexes on lane_name for fast schema lookups
  - Indexes on user_id and created_at for transition history
  - Indexes on alert severity for filtering
*/

-- ============================================================================
-- Table: lane_contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS lane_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_name TEXT NOT NULL UNIQUE, -- 'chat', 'recruiting_general', 'recruiting_clinician', 'sports'
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- JSON schemas defining valid context shape
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of required field names
  optional_fields JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of optional field names
  forbidden_fields JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of fields that must NOT be present
  
  -- Full JSON schema for comprehensive validation
  context_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Lane-specific constraints
  max_context_size_kb INTEGER DEFAULT 100,
  requires_clinician_id BOOLEAN DEFAULT false,
  requires_space_id BOOLEAN DEFAULT false,
  
  -- System prompt template for this lane
  system_prompt_template TEXT,
  
  -- Active status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lane_contexts_name ON lane_contexts(lane_name);
CREATE INDEX IF NOT EXISTS idx_lane_contexts_active ON lane_contexts(is_active);

-- RLS Policies (read-only for authenticated users)
ALTER TABLE lane_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active lane contexts"
  ON lane_contexts FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Service role can manage lane contexts"
  ON lane_contexts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Table: lane_transitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS lane_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  correlation_id UUID,
  
  -- Transition details
  from_lane TEXT,
  to_lane TEXT NOT NULL,
  
  -- Context snapshots
  previous_context JSONB DEFAULT '{}'::jsonb,
  new_context JSONB DEFAULT '{}'::jsonb,
  
  -- Data sanitization tracking
  fields_removed TEXT[] DEFAULT ARRAY[]::TEXT[],
  fields_added TEXT[] DEFAULT ARRAY[]::TEXT[],
  sanitization_applied BOOLEAN DEFAULT false,
  sanitization_rules_applied TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Validation results
  previous_context_valid BOOLEAN,
  new_context_valid BOOLEAN,
  validation_errors JSONB,
  
  -- Transition metadata
  trigger_source TEXT, -- 'user_action', 'automatic', 'api_call'
  conversation_id UUID,
  session_id TEXT,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lane_transitions_user_created ON lane_transitions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lane_transitions_from_to ON lane_transitions(from_lane, to_lane);
CREATE INDEX IF NOT EXISTS idx_lane_transitions_conversation ON lane_transitions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lane_transitions_correlation ON lane_transitions(correlation_id);

-- RLS Policies
ALTER TABLE lane_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lane transitions"
  ON lane_transitions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lane transitions"
  ON lane_transitions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Table: cross_lane_contamination_alerts
-- ============================================================================

CREATE TABLE IF NOT EXISTS cross_lane_contamination_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Alert details
  current_lane TEXT NOT NULL,
  contaminating_lane TEXT NOT NULL,
  
  -- Contamination detection
  contaminated_fields TEXT[] NOT NULL, -- Fields that belong to wrong lane
  detection_method TEXT NOT NULL, -- 'schema_validation', 'field_pattern_match', 'semantic_analysis'
  confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
  
  -- Context
  conversation_id UUID,
  function_name TEXT,
  
  -- Impact assessment
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
  impact_description TEXT,
  auto_corrected BOOLEAN DEFAULT false,
  correction_applied TEXT,
  
  -- Investigation status
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contamination_user_created ON cross_lane_contamination_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contamination_lanes ON cross_lane_contamination_alerts(current_lane, contaminating_lane);
CREATE INDEX IF NOT EXISTS idx_contamination_severity ON cross_lane_contamination_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_contamination_reviewed ON cross_lane_contamination_alerts(reviewed);
CREATE INDEX IF NOT EXISTS idx_contamination_correlation ON cross_lane_contamination_alerts(correlation_id);

-- RLS Policies
ALTER TABLE cross_lane_contamination_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contamination alerts"
  ON cross_lane_contamination_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert contamination alerts"
  ON cross_lane_contamination_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update contamination alerts"
  ON cross_lane_contamination_alerts FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to validate context against lane schema
CREATE OR REPLACE FUNCTION validate_lane_context(
  p_lane_name TEXT,
  p_context JSONB
)
RETURNS TABLE(
  is_valid BOOLEAN,
  missing_required_fields TEXT[],
  forbidden_fields_present TEXT[],
  validation_errors TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lane lane_contexts%ROWTYPE;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_forbidden TEXT[] := ARRAY[]::TEXT[];
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_field TEXT;
BEGIN
  -- Get lane definition
  SELECT * INTO v_lane FROM lane_contexts WHERE lane_name = p_lane_name AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY['Lane not found or inactive']::TEXT[];
    RETURN;
  END IF;
  
  -- Check required fields
  FOR v_field IN SELECT jsonb_array_elements_text(v_lane.required_fields)
  LOOP
    IF NOT (p_context ? v_field) THEN
      v_missing := array_append(v_missing, v_field);
    END IF;
  END LOOP;
  
  -- Check forbidden fields
  FOR v_field IN SELECT jsonb_array_elements_text(v_lane.forbidden_fields)
  LOOP
    IF p_context ? v_field THEN
      v_forbidden := array_append(v_forbidden, v_field);
    END IF;
  END LOOP;
  
  -- Build error messages
  IF array_length(v_missing, 1) > 0 THEN
    v_errors := array_append(v_errors, 'Missing required fields: ' || array_to_string(v_missing, ', '));
  END IF;
  
  IF array_length(v_forbidden, 1) > 0 THEN
    v_errors := array_append(v_errors, 'Forbidden fields present: ' || array_to_string(v_forbidden, ', '));
  END IF;
  
  -- Return validation result
  RETURN QUERY SELECT 
    (array_length(v_missing, 1) IS NULL AND array_length(v_forbidden, 1) IS NULL),
    v_missing,
    v_forbidden,
    v_errors;
END;
$$;

-- Function to log lane transition
CREATE OR REPLACE FUNCTION log_lane_transition(
  p_user_id UUID,
  p_from_lane TEXT,
  p_to_lane TEXT,
  p_previous_context JSONB,
  p_new_context JSONB,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transition_id UUID;
BEGIN
  INSERT INTO lane_transitions (
    user_id,
    correlation_id,
    from_lane,
    to_lane,
    previous_context,
    new_context
  ) VALUES (
    p_user_id,
    p_correlation_id,
    p_from_lane,
    p_to_lane,
    p_previous_context,
    p_new_context
  )
  RETURNING id INTO v_transition_id;
  
  RETURN v_transition_id;
END;
$$;

-- ============================================================================
-- Seed Default Lane Contexts
-- ============================================================================

INSERT INTO lane_contexts (lane_name, display_name, description, required_fields, forbidden_fields, context_schema)
VALUES
  (
    'chat',
    'General Chat',
    'General purpose chat interactions without domain-specific context',
    '["user_id", "conversation_id"]'::jsonb,
    '["clinician_id", "assignment_id", "team_id", "game_id"]'::jsonb,
    '{
      "type": "object",
      "properties": {
        "user_id": {"type": "string", "format": "uuid"},
        "conversation_id": {"type": "string", "format": "uuid"},
        "session_id": {"type": "string"},
        "space_id": {"type": ["string", "null"], "format": "uuid"}
      },
      "required": ["user_id", "conversation_id"]
    }'::jsonb
  ),
  (
    'recruiting_general',
    'Recruiting (General)',
    'General recruiting knowledge and strategies without clinician-specific context',
    '["user_id", "conversation_id"]'::jsonb,
    '["clinician_id"]'::jsonb,
    '{
      "type": "object",
      "properties": {
        "user_id": {"type": "string", "format": "uuid"},
        "conversation_id": {"type": "string", "format": "uuid"},
        "mode": {"type": "string", "enum": ["recruiting_general"]}
      },
      "required": ["user_id", "conversation_id"]
    }'::jsonb
  ),
  (
    'recruiting_clinician',
    'Recruiting (Clinician-Specific)',
    'Clinician-specific recruiting context with profile and assignment data',
    '["user_id", "conversation_id", "clinician_id"]'::jsonb,
    '[]'::jsonb,
    '{
      "type": "object",
      "properties": {
        "user_id": {"type": "string", "format": "uuid"},
        "conversation_id": {"type": "string", "format": "uuid"},
        "clinician_id": {"type": "string", "format": "uuid"},
        "mode": {"type": "string", "enum": ["recruiting_clinician"]}
      },
      "required": ["user_id", "conversation_id", "clinician_id"]
    }'::jsonb
  )
ON CONFLICT (lane_name) DO NOTHING;