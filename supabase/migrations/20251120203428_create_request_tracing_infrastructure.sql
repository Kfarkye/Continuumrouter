/*
  # Request Tracing and Observability Infrastructure

  This migration creates comprehensive request tracing tables to support system-wide
  constraint architecture, debugging, and observability.

  ## Tables Created

  1. request_traces
     - Captures full lifecycle of every user request
     - Tracks correlation IDs, timestamps, function chains, final status
     - Enables end-to-end request flow visualization

  2. function_call_logs
     - Logs each edge function invocation
     - Links to parent request via correlation ID
     - Tracks input/output validation, duration, errors

  3. constraint_violations
     - Records verification check failures
     - Captures date mismatches, schema failures, lane violations
     - Enables pattern analysis of failure modes

  ## Security
  - All tables have RLS enabled
  - Users can only access their own traces
  - Service role can access all traces for debugging

  ## Performance
  - Indexes on correlation_id for fast trace reconstruction
  - Indexes on user_id and created_at for user-specific queries
  - Indexes on violation_type for pattern analysis
*/

-- ============================================================================
-- Table: request_traces
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Request context
  conversation_id UUID,
  session_id TEXT,
  mode TEXT, -- 'chat', 'recruiting_general', 'recruiting_clinician', 'sports'
  
  -- Request metadata
  entry_point TEXT NOT NULL, -- 'ai-chat-router', 'perplexity-search', 'deepthink', etc.
  request_method TEXT DEFAULT 'POST',
  
  -- Lifecycle tracking
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Function call chain (array of function names)
  function_chain TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Status and errors
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'success', 'error', 'timeout'
  error_message TEXT,
  error_code TEXT,
  
  -- Cost tracking
  total_cost_usd DECIMAL(10, 6) DEFAULT 0.00,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_request_traces_correlation ON request_traces(correlation_id);
CREATE INDEX IF NOT EXISTS idx_request_traces_user_created ON request_traces(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_traces_conversation ON request_traces(conversation_id);
CREATE INDEX IF NOT EXISTS idx_request_traces_status ON request_traces(status);
CREATE INDEX IF NOT EXISTS idx_request_traces_entry_point ON request_traces(entry_point);

-- RLS Policies
ALTER TABLE request_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own request traces"
  ON request_traces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own request traces"
  ON request_traces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own request traces"
  ON request_traces FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Table: function_call_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS function_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  parent_request_id UUID REFERENCES request_traces(id) ON DELETE CASCADE,
  
  -- Function identification
  function_name TEXT NOT NULL, -- 'ai-chat-router', 'perplexity-search', etc.
  function_version TEXT,
  
  -- Execution tracking
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Input/output tracking
  input_payload_hash TEXT, -- SHA256 hash of input for deduplication
  input_size_bytes INTEGER,
  output_size_bytes INTEGER,
  
  -- Validation status
  input_schema_valid BOOLEAN,
  output_schema_valid BOOLEAN,
  validation_errors JSONB,
  
  -- Status and errors
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'error', 'timeout'
  error_message TEXT,
  error_stack TEXT,
  
  -- Cost tracking
  cost_usd DECIMAL(10, 6) DEFAULT 0.00,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_function_logs_correlation ON function_call_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_function_logs_parent_request ON function_call_logs(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_function_logs_function_name ON function_call_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_function_logs_status ON function_call_logs(status);
CREATE INDEX IF NOT EXISTS idx_function_logs_created ON function_call_logs(created_at DESC);

-- RLS Policies
ALTER TABLE function_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own function logs via request trace"
  ON function_call_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM request_traces
      WHERE request_traces.id = function_call_logs.parent_request_id
      AND request_traces.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert function logs"
  ON function_call_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Table: constraint_violations
-- ============================================================================

CREATE TABLE IF NOT EXISTS constraint_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  parent_request_id UUID REFERENCES request_traces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Violation identification
  violation_type TEXT NOT NULL, -- 'date_mismatch', 'schema_validation_failed', 'lane_boundary_crossed', etc.
  violation_category TEXT NOT NULL, -- 'input', 'output', 'context', 'provider'
  
  -- Context
  function_name TEXT,
  provider_name TEXT,
  model_name TEXT,
  
  -- Violation details
  rule_name TEXT NOT NULL,
  expected_value TEXT,
  actual_value TEXT,
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
  
  -- Impact
  request_blocked BOOLEAN DEFAULT false,
  user_notified BOOLEAN DEFAULT false,
  
  -- Flexible metadata for detailed violation info
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_violations_correlation ON constraint_violations(correlation_id);
CREATE INDEX IF NOT EXISTS idx_violations_parent_request ON constraint_violations(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_violations_user_created ON constraint_violations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_type ON constraint_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_violations_category ON constraint_violations(violation_category);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON constraint_violations(severity);

-- RLS Policies
ALTER TABLE constraint_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own constraint violations"
  ON constraint_violations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert violations"
  ON constraint_violations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update request trace status
CREATE OR REPLACE FUNCTION update_request_trace_status(
  p_correlation_id UUID,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE request_traces
  SET 
    status = p_status,
    error_message = p_error_message,
    completed_at = CASE WHEN p_status IN ('success', 'error', 'timeout') THEN NOW() ELSE completed_at END,
    duration_ms = CASE WHEN p_status IN ('success', 'error', 'timeout') THEN EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 ELSE duration_ms END,
    updated_at = NOW()
  WHERE correlation_id = p_correlation_id;
END;
$$;

-- Function to add function to call chain
CREATE OR REPLACE FUNCTION append_function_to_chain(
  p_correlation_id UUID,
  p_function_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE request_traces
  SET 
    function_chain = array_append(function_chain, p_function_name),
    updated_at = NOW()
  WHERE correlation_id = p_correlation_id;
END;
$$;

-- Function to get full request trace with all logs and violations
CREATE OR REPLACE FUNCTION get_request_trace(p_correlation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trace JSON;
BEGIN
  SELECT json_build_object(
    'request_trace', row_to_json(rt.*),
    'function_calls', (
      SELECT json_agg(row_to_json(fc.*))
      FROM function_call_logs fc
      WHERE fc.correlation_id = p_correlation_id
    ),
    'violations', (
      SELECT json_agg(row_to_json(cv.*))
      FROM constraint_violations cv
      WHERE cv.correlation_id = p_correlation_id
    )
  )
  INTO v_trace
  FROM request_traces rt
  WHERE rt.correlation_id = p_correlation_id;
  
  RETURN v_trace;
END;
$$;