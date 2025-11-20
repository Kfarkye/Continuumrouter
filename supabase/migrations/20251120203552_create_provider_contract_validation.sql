/*
  # Provider Response Contract Validation Infrastructure

  This migration creates tables and functions to validate provider API responses
  against expected schemas, track compliance rates, and detect schema drift.

  ## Tables Created

  1. provider_response_schemas
     - Stores expected JSON schemas for each provider/model/endpoint
     - Enables automatic response validation
     - Supports schema versioning

  2. provider_schema_violations
     - Logs when provider responses fail schema validation
     - Captures expected vs actual schema differences
     - Links to request traces via correlation ID

  3. provider_reliability_metrics
     - Aggregates schema compliance, latency, error rates
     - Per provider/model combination
     - Updated in near real-time

  ## Security
  - All tables have RLS enabled
  - Schema definitions managed by service role
  - Users can view violations for their own requests

  ## Performance
  - Indexes on provider/model for fast schema lookups
  - Materialized view for reliability metrics
  - Periodic refresh for aggregate metrics
*/

-- ============================================================================
-- Table: provider_response_schemas
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_response_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider identification
  provider_name TEXT NOT NULL, -- 'anthropic', 'openai', 'gemini', 'perplexity'
  model_name TEXT NOT NULL,
  endpoint_name TEXT NOT NULL, -- 'chat', 'completion', 'search', 'embedding'
  
  -- Schema definition
  schema_version TEXT NOT NULL DEFAULT 'v1',
  response_schema JSONB NOT NULL, -- Full JSON schema for response validation
  
  -- Schema metadata
  description TEXT,
  example_response JSONB,
  
  -- Validation rules
  required_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
  optional_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
  strict_validation BOOLEAN DEFAULT true, -- Reject extra fields not in schema
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  deprecated_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES provider_response_schemas(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider_name, model_name, endpoint_name, schema_version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_schemas_provider_model ON provider_response_schemas(provider_name, model_name);
CREATE INDEX IF NOT EXISTS idx_provider_schemas_active ON provider_response_schemas(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_schemas_endpoint ON provider_response_schemas(endpoint_name);

-- RLS Policies
ALTER TABLE provider_response_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active provider schemas"
  ON provider_response_schemas FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Service role can manage provider schemas"
  ON provider_response_schemas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Table: provider_schema_violations
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_schema_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  parent_request_id UUID REFERENCES request_traces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider context
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  endpoint_name TEXT NOT NULL,
  schema_id UUID REFERENCES provider_response_schemas(id),
  
  -- Violation details
  violation_type TEXT NOT NULL, -- 'missing_field', 'invalid_type', 'extra_field', 'invalid_format'
  field_path TEXT, -- JSON path to violating field (e.g., 'choices[0].message.content')
  
  -- Expected vs actual
  expected_schema JSONB,
  actual_value JSONB,
  error_message TEXT,
  
  -- Context
  function_name TEXT,
  request_id TEXT, -- Provider's request ID if available
  
  -- Impact assessment
  severity TEXT DEFAULT 'error', -- 'warning', 'error', 'critical'
  response_usable BOOLEAN DEFAULT false, -- Could we still extract useful data?
  fallback_applied BOOLEAN DEFAULT false,
  
  -- Response metadata
  response_status_code INTEGER,
  response_headers JSONB,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schema_violations_correlation ON provider_schema_violations(correlation_id);
CREATE INDEX IF NOT EXISTS idx_schema_violations_parent_request ON provider_schema_violations(parent_request_id);
CREATE INDEX IF NOT EXISTS idx_schema_violations_user_created ON provider_schema_violations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schema_violations_provider_model ON provider_schema_violations(provider_name, model_name);
CREATE INDEX IF NOT EXISTS idx_schema_violations_type ON provider_schema_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_schema_violations_severity ON provider_schema_violations(severity);

-- RLS Policies
ALTER TABLE provider_schema_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schema violations"
  ON provider_schema_violations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert schema violations"
  ON provider_schema_violations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Table: provider_reliability_metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_reliability_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider identification
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  endpoint_name TEXT NOT NULL,
  
  -- Time window for aggregation
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Request counts
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  
  -- Schema compliance
  schema_valid_responses INTEGER DEFAULT 0,
  schema_violations INTEGER DEFAULT 0,
  compliance_rate DECIMAL(5, 2), -- Percentage (0.00 to 100.00)
  
  -- Latency metrics (milliseconds)
  avg_latency_ms DECIMAL(10, 2),
  p50_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  p99_latency_ms INTEGER,
  max_latency_ms INTEGER,
  
  -- Error rates
  error_rate DECIMAL(5, 2), -- Percentage
  timeout_count INTEGER DEFAULT 0,
  
  -- Cost metrics
  total_cost_usd DECIMAL(10, 6),
  avg_cost_per_request_usd DECIMAL(10, 6),
  
  -- Violation breakdown
  violation_types JSONB DEFAULT '{}'::jsonb, -- Map of violation_type -> count
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider_name, model_name, endpoint_name, window_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reliability_provider_model ON provider_reliability_metrics(provider_name, model_name);
CREATE INDEX IF NOT EXISTS idx_reliability_window ON provider_reliability_metrics(window_start DESC);
CREATE INDEX IF NOT EXISTS idx_reliability_compliance ON provider_reliability_metrics(compliance_rate);

-- RLS Policies
ALTER TABLE provider_reliability_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reliability metrics"
  ON provider_reliability_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage reliability metrics"
  ON provider_reliability_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get active schema for provider/model/endpoint
CREATE OR REPLACE FUNCTION get_provider_schema(
  p_provider_name TEXT,
  p_model_name TEXT,
  p_endpoint_name TEXT
)
RETURNS provider_response_schemas
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_schema provider_response_schemas%ROWTYPE;
BEGIN
  SELECT * INTO v_schema
  FROM provider_response_schemas
  WHERE provider_name = p_provider_name
    AND model_name = p_model_name
    AND endpoint_name = p_endpoint_name
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN v_schema;
END;
$$;

-- Function to log schema violation
CREATE OR REPLACE FUNCTION log_schema_violation(
  p_correlation_id UUID,
  p_user_id UUID,
  p_provider_name TEXT,
  p_model_name TEXT,
  p_endpoint_name TEXT,
  p_violation_type TEXT,
  p_field_path TEXT,
  p_error_message TEXT,
  p_severity TEXT DEFAULT 'error'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_violation_id UUID;
BEGIN
  INSERT INTO provider_schema_violations (
    correlation_id,
    user_id,
    provider_name,
    model_name,
    endpoint_name,
    violation_type,
    field_path,
    error_message,
    severity
  ) VALUES (
    p_correlation_id,
    p_user_id,
    p_provider_name,
    p_model_name,
    p_endpoint_name,
    p_violation_type,
    p_field_path,
    p_error_message,
    p_severity
  )
  RETURNING id INTO v_violation_id;
  
  RETURN v_violation_id;
END;
$$;

-- Function to update reliability metrics (called periodically)
CREATE OR REPLACE FUNCTION refresh_provider_reliability_metrics(
  p_window_hours INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO provider_reliability_metrics (
    provider_name,
    model_name,
    endpoint_name,
    window_start,
    window_end,
    total_requests,
    successful_requests,
    failed_requests,
    schema_valid_responses,
    schema_violations,
    compliance_rate,
    avg_latency_ms,
    error_rate,
    total_cost_usd
  )
  SELECT
    fcl.metadata->>'provider_name' as provider_name,
    fcl.metadata->>'model_name' as model_name,
    fcl.function_name as endpoint_name,
    date_trunc('hour', NOW() - (p_window_hours || ' hours')::interval) as window_start,
    NOW() as window_end,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE fcl.status = 'success') as successful_requests,
    COUNT(*) FILTER (WHERE fcl.status = 'error') as failed_requests,
    COUNT(*) FILTER (WHERE fcl.output_schema_valid = true) as schema_valid_responses,
    COUNT(*) FILTER (WHERE fcl.output_schema_valid = false) as schema_violations,
    ROUND(
      (COUNT(*) FILTER (WHERE fcl.output_schema_valid = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
      2
    ) as compliance_rate,
    ROUND(AVG(fcl.duration_ms), 2) as avg_latency_ms,
    ROUND(
      (COUNT(*) FILTER (WHERE fcl.status = 'error')::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
      2
    ) as error_rate,
    SUM(fcl.cost_usd) as total_cost_usd
  FROM function_call_logs fcl
  WHERE fcl.created_at >= NOW() - (p_window_hours || ' hours')::interval
    AND fcl.metadata->>'provider_name' IS NOT NULL
  GROUP BY
    fcl.metadata->>'provider_name',
    fcl.metadata->>'model_name',
    fcl.function_name
  ON CONFLICT (provider_name, model_name, endpoint_name, window_start)
  DO UPDATE SET
    total_requests = EXCLUDED.total_requests,
    successful_requests = EXCLUDED.successful_requests,
    failed_requests = EXCLUDED.failed_requests,
    schema_valid_responses = EXCLUDED.schema_valid_responses,
    schema_violations = EXCLUDED.schema_violations,
    compliance_rate = EXCLUDED.compliance_rate,
    avg_latency_ms = EXCLUDED.avg_latency_ms,
    error_rate = EXCLUDED.error_rate,
    total_cost_usd = EXCLUDED.total_cost_usd,
    updated_at = NOW();
END;
$$;