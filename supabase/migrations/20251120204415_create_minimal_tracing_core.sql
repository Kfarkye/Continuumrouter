/*
  # Minimal Tracing Core (3 Tables)

  This migration creates a lightweight tracing system that makes existing logs queryable
  via correlation IDs. Replaces 13 overengineered tables with 3 focused ones.

  ## Core Philosophy
  - One row per request in request_contexts
  - One row per provider call in provider_calls
  - One row per verification check in verification_results
  - Everything else hangs off correlation_id

  ## Tables Created

  1. request_contexts
     - The "request ID" that ties everything together
     - Who/what/where context for the request
     - Success/partial/failed status

  2. provider_calls
     - Logs every external API call (Anthropic, OpenAI, Gemini, Perplexity)
     - Captures latency, tokens, cost, success/failure
     - Links to parent request via request_id

  3. verification_results
     - Logs pass/fail for constraint checks (date_match, lane_match, etc.)
     - Simple rule + passed + details structure
     - Rules defined in code, not DB

  ## What This Enables
  - Query all data for a single request via correlation_id
  - See provider performance by lane/mode
  - Track verification failures for debugging
  - Derive cost metrics by aggregating provider_calls
*/

-- ============================================================================
-- Table: request_contexts
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User and conversation context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID,
  session_id TEXT,
  
  -- Mode and lane
  mode TEXT NOT NULL, -- 'chat', 'recruiting_general', 'recruiting_clinician', 'sports', 'deepthink', 'tutorial'
  lane TEXT NOT NULL, -- 'router', 'search', 'deepthink', 'memory', 'reply'
  
  -- Space/project context (nullable)
  space_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL,
  
  -- Request lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'partial', 'failed'
  
  -- Error tracking
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_request_contexts_id ON request_contexts(id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_user_created ON request_contexts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_contexts_conversation ON request_contexts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_request_contexts_mode ON request_contexts(mode);
CREATE INDEX IF NOT EXISTS idx_request_contexts_lane ON request_contexts(lane);
CREATE INDEX IF NOT EXISTS idx_request_contexts_status ON request_contexts(status);

-- RLS Policies
ALTER TABLE request_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own request contexts"
  ON request_contexts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert request contexts"
  ON request_contexts FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update request contexts"
  ON request_contexts FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Table: provider_calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES request_contexts(id) ON DELETE CASCADE,
  
  -- Provider identification
  provider TEXT NOT NULL, -- 'anthropic', 'openai', 'gemini', 'perplexity'
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL, -- 'chat', 'completion', 'search', 'embedding'
  
  -- Performance metrics
  latency_ms INTEGER,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0.00,
  
  -- Status tracking
  success BOOLEAN NOT NULL,
  schema_ok BOOLEAN, -- Did response match expected shape? (nullable for now)
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_calls_request ON provider_calls(request_id);
CREATE INDEX IF NOT EXISTS idx_provider_calls_provider ON provider_calls(provider, model);
CREATE INDEX IF NOT EXISTS idx_provider_calls_created ON provider_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_calls_success ON provider_calls(success);

-- RLS Policies
ALTER TABLE provider_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provider calls via request"
  ON provider_calls FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM request_contexts
      WHERE request_contexts.id = provider_calls.request_id
      AND request_contexts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert provider calls"
  ON provider_calls FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Table: verification_results
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES request_contexts(id) ON DELETE CASCADE,
  
  -- Rule identification (rules defined in code)
  rule TEXT NOT NULL, -- 'date_match', 'lane_match', 'syntax_valid', 'db_insert_ok'
  
  -- Result
  passed BOOLEAN NOT NULL,
  
  -- Failure details (JSONB for flexibility)
  details JSONB DEFAULT '{}'::jsonb,
  -- Example: {"expected": "2025-11-20", "actual": "2024-11-20", "field": "game_date"}
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_results_request ON verification_results(request_id);
CREATE INDEX IF NOT EXISTS idx_verification_results_rule ON verification_results(rule);
CREATE INDEX IF NOT EXISTS idx_verification_results_passed ON verification_results(passed);
CREATE INDEX IF NOT EXISTS idx_verification_results_created ON verification_results(created_at DESC);

-- RLS Policies
ALTER TABLE verification_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verification results via request"
  ON verification_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM request_contexts
      WHERE request_contexts.id = verification_results.request_id
      AND request_contexts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert verification results"
  ON verification_results FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get full request trace by correlation_id
CREATE OR REPLACE FUNCTION get_request_trace(p_request_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'request', (
      SELECT row_to_json(rc.*)
      FROM request_contexts rc
      WHERE rc.id = p_request_id
    ),
    'provider_calls', (
      SELECT json_agg(row_to_json(pc.*))
      FROM provider_calls pc
      WHERE pc.request_id = p_request_id
    ),
    'verifications', (
      SELECT json_agg(row_to_json(vr.*))
      FROM verification_results vr
      WHERE vr.request_id = p_request_id
    ),
    'messages', (
      SELECT json_agg(row_to_json(am.*))
      FROM ai_messages am
      WHERE am.correlation_id = p_request_id
    ),
    'search_queries', (
      SELECT json_agg(row_to_json(sq.*))
      FROM search_queries sq
      WHERE sq.correlation_id = p_request_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Function to get violations (failed verifications)
CREATE OR REPLACE VIEW constraint_violations AS
  SELECT 
    vr.id,
    vr.request_id,
    rc.user_id,
    rc.mode,
    rc.lane,
    vr.rule,
    vr.details,
    vr.created_at
  FROM verification_results vr
  JOIN request_contexts rc ON rc.id = vr.request_id
  WHERE vr.passed = false;

-- Function to get cost by lane
CREATE OR REPLACE FUNCTION get_lane_costs(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  lane TEXT,
  mode TEXT,
  total_cost_usd DECIMAL,
  total_calls BIGINT,
  avg_latency_ms DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.lane,
    rc.mode,
    SUM(pc.cost_usd) as total_cost_usd,
    COUNT(pc.id) as total_calls,
    ROUND(AVG(pc.latency_ms), 2) as avg_latency_ms
  FROM request_contexts rc
  JOIN provider_calls pc ON pc.request_id = rc.id
  WHERE rc.user_id = p_user_id
    AND rc.created_at >= p_start_date
    AND rc.created_at <= p_end_date
  GROUP BY rc.lane, rc.mode
  ORDER BY total_cost_usd DESC;
END;
$$;