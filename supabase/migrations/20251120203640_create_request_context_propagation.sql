/*
  # Request Context Propagation Infrastructure

  This migration creates tables and functions to capture and propagate structured
  context objects across all function calls, enabling consistent context validation
  and debugging across the entire request lifecycle.

  ## Tables Created

  1. request_contexts
     - Captures full context object for every request
     - Links to all downstream tables via correlation_id
     - Enables context reconstruction for debugging

  ## Security
  - RLS enabled with user-scoped access
  - Service role can access all contexts

  ## Performance
  - Indexes on correlation_id for fast lookups
  - Indexes on user_id and created_at for user queries
  - Indexes on mode and space_id for filtering
*/

-- ============================================================================
-- Table: request_contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL UNIQUE,
  
  -- User identification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Conversation identification
  conversation_id UUID,
  session_id TEXT,
  message_id TEXT,
  
  -- Mode and lane context
  mode TEXT NOT NULL, -- 'chat', 'recruiting_general', 'recruiting_clinician', 'sports', 'deepthink', 'tutorial'
  lane_name TEXT,
  
  -- Space/project context
  space_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_type TEXT, -- 'vertical', 'clinician', 'general'
  
  -- Domain-specific identifiers
  clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL,
  assignment_id UUID,
  thread_id UUID,
  
  -- Full context object (validated against lane schema)
  context_data JSONB NOT NULL,
  
  -- Validation status
  context_valid BOOLEAN DEFAULT true,
  validation_errors TEXT[],
  schema_version TEXT,
  
  -- Request metadata
  entry_function TEXT NOT NULL, -- First function that created this context
  user_agent TEXT,
  ip_address INET,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Optional TTL for context cleanup
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_request_contexts_correlation ON request_contexts(correlation_id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_user_created ON request_contexts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_contexts_conversation ON request_contexts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_mode ON request_contexts(mode);
CREATE INDEX IF NOT EXISTS idx_request_contexts_space ON request_contexts(space_id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_clinician ON request_contexts(clinician_id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_lane ON request_contexts(lane_name);
CREATE INDEX IF NOT EXISTS idx_request_contexts_expires ON request_contexts(expires_at) WHERE expires_at IS NOT NULL;

-- RLS Policies
ALTER TABLE request_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own request contexts"
  ON request_contexts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own request contexts"
  ON request_contexts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own request contexts"
  ON request_contexts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can access all contexts"
  ON request_contexts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Add Foreign Key References to Existing Tables
-- ============================================================================

-- Add correlation_id to search_queries if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'search_queries' AND column_name = 'correlation_id'
  ) THEN
    ALTER TABLE search_queries ADD COLUMN correlation_id UUID;
    CREATE INDEX IF NOT EXISTS idx_search_queries_correlation ON search_queries(correlation_id);
  END IF;
END $$;

-- Add correlation_id to ai_messages if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'correlation_id'
  ) THEN
    ALTER TABLE ai_messages ADD COLUMN correlation_id UUID;
    CREATE INDEX IF NOT EXISTS idx_ai_messages_correlation ON ai_messages(correlation_id);
  END IF;
END $$;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to create or update request context
CREATE OR REPLACE FUNCTION upsert_request_context(
  p_correlation_id UUID,
  p_user_id UUID,
  p_mode TEXT,
  p_context_data JSONB,
  p_entry_function TEXT,
  p_conversation_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_space_id UUID DEFAULT NULL,
  p_clinician_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context_id UUID;
  v_lane_name TEXT;
BEGIN
  -- Determine lane name from mode
  v_lane_name := CASE
    WHEN p_mode IN ('chat', 'deepthink', 'tutorial') THEN 'chat'
    WHEN p_mode = 'recruiting_general' THEN 'recruiting_general'
    WHEN p_mode = 'recruiting_clinician' THEN 'recruiting_clinician'
    ELSE 'chat'
  END;
  
  INSERT INTO request_contexts (
    correlation_id,
    user_id,
    conversation_id,
    session_id,
    mode,
    lane_name,
    space_id,
    clinician_id,
    context_data,
    entry_function
  ) VALUES (
    p_correlation_id,
    p_user_id,
    p_conversation_id,
    p_session_id,
    p_mode,
    v_lane_name,
    p_space_id,
    p_clinician_id,
    p_context_data,
    p_entry_function
  )
  ON CONFLICT (correlation_id) DO UPDATE SET
    last_accessed_at = NOW(),
    context_data = p_context_data,
    metadata = request_contexts.metadata || jsonb_build_object('access_count', COALESCE((request_contexts.metadata->>'access_count')::int, 0) + 1)
  RETURNING id INTO v_context_id;
  
  RETURN v_context_id;
END;
$$;

-- Function to get request context by correlation_id
CREATE OR REPLACE FUNCTION get_request_context(p_correlation_id UUID)
RETURNS request_contexts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context request_contexts%ROWTYPE;
BEGIN
  SELECT * INTO v_context
  FROM request_contexts
  WHERE correlation_id = p_correlation_id;
  
  -- Update last accessed timestamp
  IF FOUND THEN
    UPDATE request_contexts
    SET last_accessed_at = NOW()
    WHERE correlation_id = p_correlation_id;
  END IF;
  
  RETURN v_context;
END;
$$;

-- Function to validate context against lane schema
CREATE OR REPLACE FUNCTION validate_context_for_lane(
  p_correlation_id UUID
)
RETURNS TABLE(
  is_valid BOOLEAN,
  validation_errors TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context request_contexts%ROWTYPE;
  v_validation_result RECORD;
BEGIN
  -- Get context
  SELECT * INTO v_context FROM request_contexts WHERE correlation_id = p_correlation_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['Context not found']::TEXT[];
    RETURN;
  END IF;
  
  -- Validate against lane schema
  SELECT * INTO v_validation_result
  FROM validate_lane_context(v_context.lane_name, v_context.context_data);
  
  -- Update context with validation results
  UPDATE request_contexts
  SET
    context_valid = v_validation_result.is_valid,
    validation_errors = v_validation_result.validation_errors
  WHERE correlation_id = p_correlation_id;
  
  RETURN QUERY SELECT v_validation_result.is_valid, v_validation_result.validation_errors;
END;
$$;

-- Function to get all data for a correlation_id (full request trace)
CREATE OR REPLACE FUNCTION get_full_request_data(p_correlation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'context', (
      SELECT row_to_json(rc.*)
      FROM request_contexts rc
      WHERE rc.correlation_id = p_correlation_id
    ),
    'trace', (
      SELECT row_to_json(rt.*)
      FROM request_traces rt
      WHERE rt.correlation_id = p_correlation_id
    ),
    'function_calls', (
      SELECT json_agg(row_to_json(fc.*))
      FROM function_call_logs fc
      WHERE fc.correlation_id = p_correlation_id
    ),
    'violations', (
      SELECT json_agg(row_to_json(cv.*))
      FROM constraint_violations cv
      WHERE cv.correlation_id = p_correlation_id
    ),
    'schema_violations', (
      SELECT json_agg(row_to_json(psv.*))
      FROM provider_schema_violations psv
      WHERE psv.correlation_id = p_correlation_id
    ),
    'search_queries', (
      SELECT json_agg(row_to_json(sq.*))
      FROM search_queries sq
      WHERE sq.correlation_id = p_correlation_id
    ),
    'messages', (
      SELECT json_agg(row_to_json(am.*))
      FROM ai_messages am
      WHERE am.correlation_id = p_correlation_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function to clean up expired contexts
CREATE OR REPLACE FUNCTION cleanup_expired_contexts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM request_contexts
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- Automatic Cleanup Job (Optional - commented out, enable if needed)
-- ============================================================================

/*
-- Create a pg_cron job to cleanup expired contexts every hour
-- Requires pg_cron extension to be enabled
SELECT cron.schedule(
  'cleanup-expired-contexts',
  '0 * * * *', -- Every hour
  $$SELECT cleanup_expired_contexts();$$
);
*/