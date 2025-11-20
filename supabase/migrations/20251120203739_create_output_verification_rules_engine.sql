/*
  # Output Verification Rules Engine

  This migration creates a pluggable verification rules engine that runs automated
  checks on AI outputs based on query type, mode, and domain. Extends the date
  verification pattern to all output types.

  ## Tables Created

  1. verification_rules
     - Defines pluggable verification checks
     - Rules are conditional based on query metadata
     - Supports multiple rule types (date, style, syntax, semantic)

  2. verification_results
     - Logs outcome of each verification check
     - Links to correlation_id for full traceability
     - Captures pass/fail status and failure details

  3. verification_rule_executions
     - Tracks which rules ran for each request
     - Enables debugging of rule selection logic
     - Performance metrics per rule

  ## Security
  - All tables have RLS enabled
  - Rule definitions managed by service role
  - Users can view verification results for their requests

  ## Performance
  - Indexes on rule_type and is_active for fast rule selection
  - Indexes on correlation_id for result lookups
  - Indexes on pass/fail status for analytics
*/

-- ============================================================================
-- Table: verification_rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule identification
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT NOT NULL, -- 'date_match', 'style_match', 'syntax_valid', 'semantic_coherence', 'tone_appropriate', 'length_check'
  category TEXT NOT NULL, -- 'sports', 'recruiting', 'code', 'general'
  
  -- Rule description
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Applicability conditions (JSONB query to match against request context)
  applies_when JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Example: {"mode": "recruiting_clinician", "has_clinician_id": true}
  -- Example: {"query_contains": ["today", "schedule", "game"]}
  
  -- Rule logic
  rule_logic TEXT NOT NULL, -- SQL function name or validation logic
  rule_parameters JSONB DEFAULT '{}'::jsonb, -- Parameters to pass to rule logic
  
  -- Severity and impact
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
  block_on_failure BOOLEAN DEFAULT false, -- Should we block the response if this rule fails?
  
  -- Rule metadata
  expected_pattern TEXT, -- Human-readable description of what rule checks
  failure_message_template TEXT, -- Template for failure message with placeholders
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100, -- Lower number = higher priority
  
  -- Performance
  timeout_ms INTEGER DEFAULT 5000, -- Max time allowed for rule execution
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_rules_type ON verification_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_verification_rules_category ON verification_rules(category);
CREATE INDEX IF NOT EXISTS idx_verification_rules_active ON verification_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_verification_rules_priority ON verification_rules(priority);

-- RLS Policies
ALTER TABLE verification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active verification rules"
  ON verification_rules FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Service role can manage verification rules"
  ON verification_rules FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Table: verification_results
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  parent_request_id UUID REFERENCES request_traces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rule identification
  rule_id UUID NOT NULL REFERENCES verification_rules(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  
  -- Execution context
  conversation_id UUID,
  message_id TEXT,
  function_name TEXT,
  
  -- Verification result
  passed BOOLEAN NOT NULL,
  confidence_score DECIMAL(3, 2), -- 0.00 to 1.00, if applicable
  
  -- Failure details
  failure_reason TEXT,
  expected_value TEXT,
  actual_value TEXT,
  field_path TEXT, -- Path to violating field in output
  
  -- Context snapshot
  input_data JSONB, -- Sample of input that was verified
  output_data JSONB, -- Sample of output that was verified
  
  -- Actions taken
  response_blocked BOOLEAN DEFAULT false,
  auto_corrected BOOLEAN DEFAULT false,
  correction_applied TEXT,
  
  -- Performance
  execution_time_ms INTEGER,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_results_correlation ON verification_results(correlation_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_parent_request ON verification_results(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_user_created ON verification_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_results_rule ON verification_results(rule_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_passed ON verification_results(passed);
CREATE INDEX IF NOT EXISTS idx_verification_results_type ON verification_results(rule_type);
CREATE INDEX IF NOT EXISTS idx_verification_results_blocked ON verification_results(response_blocked);

-- RLS Policies
ALTER TABLE verification_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verification results"
  ON verification_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert verification results"
  ON verification_results FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Table: verification_rule_executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  
  -- Execution summary
  total_rules_evaluated INTEGER DEFAULT 0,
  rules_passed INTEGER DEFAULT 0,
  rules_failed INTEGER DEFAULT 0,
  rules_skipped INTEGER DEFAULT 0,
  
  -- Rule selection
  applicable_rules UUID[] DEFAULT ARRAY[]::UUID[], -- Array of rule IDs that matched
  selection_criteria JSONB, -- Criteria used to select rules
  
  -- Performance
  total_execution_time_ms INTEGER,
  slowest_rule_name TEXT,
  slowest_rule_time_ms INTEGER,
  
  -- Actions taken
  any_blocking_failures BOOLEAN DEFAULT false,
  response_allowed BOOLEAN DEFAULT true,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rule_executions_correlation ON verification_rule_executions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_rule_executions_created ON verification_rule_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_executions_blocking ON verification_rule_executions(any_blocking_failures);

-- RLS Policies
ALTER TABLE verification_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access rule executions"
  ON verification_rule_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get applicable rules for a request context
CREATE OR REPLACE FUNCTION get_applicable_rules(
  p_context JSONB
)
RETURNS TABLE(
  rule_id UUID,
  rule_name TEXT,
  rule_type TEXT,
  rule_logic TEXT,
  rule_parameters JSONB,
  severity TEXT,
  block_on_failure BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vr.id,
    vr.rule_name,
    vr.rule_type,
    vr.rule_logic,
    vr.rule_parameters,
    vr.severity,
    vr.block_on_failure
  FROM verification_rules vr
  WHERE vr.is_active = true
    AND (
      -- Check if context matches applies_when conditions
      vr.applies_when = '{}'::jsonb OR
      p_context @> vr.applies_when
    )
  ORDER BY vr.priority ASC;
END;
$$;

-- Function to log verification result
CREATE OR REPLACE FUNCTION log_verification_result(
  p_correlation_id UUID,
  p_user_id UUID,
  p_rule_id UUID,
  p_passed BOOLEAN,
  p_failure_reason TEXT DEFAULT NULL,
  p_expected_value TEXT DEFAULT NULL,
  p_actual_value TEXT DEFAULT NULL,
  p_response_blocked BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result_id UUID;
  v_rule verification_rules%ROWTYPE;
BEGIN
  -- Get rule details
  SELECT * INTO v_rule FROM verification_rules WHERE id = p_rule_id;
  
  INSERT INTO verification_results (
    correlation_id,
    user_id,
    rule_id,
    rule_name,
    rule_type,
    passed,
    failure_reason,
    expected_value,
    actual_value,
    response_blocked
  ) VALUES (
    p_correlation_id,
    p_user_id,
    p_rule_id,
    v_rule.rule_name,
    v_rule.rule_type,
    p_passed,
    p_failure_reason,
    p_expected_value,
    p_actual_value,
    p_response_blocked
  )
  RETURNING id INTO v_result_id;
  
  RETURN v_result_id;
END;
$$;

-- ============================================================================
-- Seed Default Verification Rules
-- ============================================================================

-- Rule: Date Match for Sports Queries
INSERT INTO verification_rules (
  rule_name,
  rule_type,
  category,
  display_name,
  description,
  applies_when,
  rule_logic,
  rule_parameters,
  severity,
  block_on_failure,
  expected_pattern,
  failure_message_template
)
VALUES (
  'sports_date_match',
  'date_match',
  'sports',
  'Sports Date Verification',
  'Verifies that dates mentioned in sports queries match the current date when "today" is in the query',
  '{"query_contains": ["today", "tonight", "schedule", "game"]}'::jsonb,
  'verify_date_match',
  '{"date_field": "mentioned_date", "expected_date": "current_date"}'::jsonb,
  'error',
  false,
  'All dates in response should match current date when query asks about "today"',
  'Expected date {expected_value} but found {actual_value} in response'
)
ON CONFLICT (rule_name) DO NOTHING;

-- Rule: Communication Style Match for Recruiting
INSERT INTO verification_rules (
  rule_name,
  rule_type,
  category,
  display_name,
  description,
  applies_when,
  rule_logic,
  rule_parameters,
  severity,
  block_on_failure,
  expected_pattern,
  failure_message_template
)
VALUES (
  'recruiting_style_match',
  'style_match',
  'recruiting',
  'Recruiting Communication Style Verification',
  'Verifies that generated replies match the clinician communication style preference',
  '{"mode": "recruiting_clinician", "has_clinician_id": true}'::jsonb,
  'verify_communication_style',
  '{"style_field": "communication_style"}'::jsonb,
  'warning',
  false,
  'Response tone should match clinician preferred communication style',
  'Expected {expected_value} style but detected {actual_value} style'
)
ON CONFLICT (rule_name) DO NOTHING;

-- Rule: Code Syntax Validation
INSERT INTO verification_rules (
  rule_name,
  rule_type,
  category,
  display_name,
  description,
  applies_when,
  rule_logic,
  rule_parameters,
  severity,
  block_on_failure,
  expected_pattern,
  failure_message_template
)
VALUES (
  'code_syntax_valid',
  'syntax_valid',
  'code',
  'Code Syntax Validation',
  'Verifies that generated code has valid syntax for the specified language',
  '{"query_contains": ["code", "function", "implement"]}'::jsonb,
  'verify_code_syntax',
  '{"language_field": "detected_language"}'::jsonb,
  'warning',
  false,
  'Generated code should have valid syntax',
  'Syntax error in {actual_value}: {failure_reason}'
)
ON CONFLICT (rule_name) DO NOTHING;

-- Rule: Response Length Check
INSERT INTO verification_rules (
  rule_name,
  rule_type,
  category,
  display_name,
  description,
  applies_when,
  rule_logic,
  rule_parameters,
  severity,
  block_on_failure,
  expected_pattern,
  failure_message_template
)
VALUES (
  'response_length_check',
  'length_check',
  'general',
  'Response Length Verification',
  'Verifies that response is neither too short nor too long',
  '{}'::jsonb,
  'verify_response_length',
  '{"min_length": 10, "max_length": 50000, "warn_threshold": 40000}'::jsonb,
  'warning',
  false,
  'Response should be between min and max length',
  'Response length {actual_value} is outside expected range'
)
ON CONFLICT (rule_name) DO NOTHING;