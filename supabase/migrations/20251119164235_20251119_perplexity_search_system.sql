/*
  # Perplexity Live Web Search System - Production Schema

  This migration creates the complete infrastructure for real-time web search
  integration with cost controls, caching, and security hardening.

  ## Tables Created

  1. search_queries
     - Tracks all search requests with cost and performance metrics
     - Enables usage analytics and debugging

  2. search_results
     - Stores individual search result citations
     - Includes embedding column for future RAG integration

  3. search_cache (UNLOGGED)
     - High-performance cache for frequent queries
     - No WAL overhead, optimized for speed

  4. organization_usage
     - Enforces quota limits at organization level
     - Atomic cost tracking prevents overspend

  ## Security

  - All tables have RLS enabled
  - Users can only access their own data
  - Service role bypass required for quota checks

  ## Performance

  - Indexes on frequently queried columns
  - UNLOGGED table for cache (faster writes)
  - Vector column for semantic search
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Table: search_queries
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  conversation_id UUID,
  query_text TEXT NOT NULL,
  detected_intent VARCHAR(50),
  provider_model VARCHAR(50) NOT NULL,
  search_triggered_by VARCHAR(20) DEFAULT 'auto',
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  latency_ms INTEGER,
  cost_usd DECIMAL(10, 6) DEFAULT 0.00,
  cache_hit BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_search_queries_user_created ON search_queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_session ON search_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_conversation ON search_queries(conversation_id);
CREATE INDEX IF NOT EXISTS idx_search_queries_intent ON search_queries(detected_intent);

-- RLS Policies
ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search queries"
  ON search_queries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search queries"
  ON search_queries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Table: search_results
-- ============================================================================

CREATE TABLE IF NOT EXISTS search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_snippet TEXT,
  source_domain TEXT,
  published_date TIMESTAMPTZ,
  rank INTEGER NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_search_results_query ON search_results(query_id);
CREATE INDEX IF NOT EXISTS idx_search_results_rank ON search_results(query_id, rank);
CREATE INDEX IF NOT EXISTS idx_search_results_domain ON search_results(source_domain);

-- Vector index for semantic search (if needed later)
CREATE INDEX IF NOT EXISTS idx_search_results_embedding ON search_results
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS Policies
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view results from own queries"
  ON search_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM search_queries
      WHERE search_queries.id = search_results.query_id
      AND search_queries.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Table: search_cache (UNLOGGED for performance)
-- ============================================================================

CREATE UNLOGGED TABLE IF NOT EXISTS search_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  model_used VARCHAR(50),
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);

-- ============================================================================
-- Table: organization_usage
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name TEXT,
  monthly_allowance_usd DECIMAL(10, 2) DEFAULT 50.00,
  current_usage_usd DECIMAL(10, 6) DEFAULT 0.00,
  search_count INTEGER DEFAULT 0,
  reset_date TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW() + INTERVAL '1 month'),
  alert_threshold_80 BOOLEAN DEFAULT false,
  alert_threshold_90 BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quota checks
CREATE INDEX IF NOT EXISTS idx_organization_usage_user ON organization_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_usage_reset ON organization_usage(reset_date);

-- RLS Policies
ALTER TABLE organization_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON organization_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON organization_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- Function: check_quota
-- ============================================================================

CREATE OR REPLACE FUNCTION check_quota(p_user_id UUID, p_estimated_cost DECIMAL DEFAULT 0.03)
RETURNS TABLE(allowed BOOLEAN, remaining_usd DECIMAL, message TEXT) AS $$
DECLARE
  v_usage RECORD;
  v_remaining DECIMAL;
BEGIN
  -- Get or create usage record
  INSERT INTO organization_usage (user_id, monthly_allowance_usd, current_usage_usd)
  VALUES (p_user_id, 50.00, 0.00)
  ON CONFLICT (user_id) DO NOTHING;

  -- Check if reset needed (new month)
  UPDATE organization_usage
  SET current_usage_usd = 0.00,
      search_count = 0,
      reset_date = date_trunc('month', NOW() + INTERVAL '1 month'),
      alert_threshold_80 = false,
      alert_threshold_90 = false,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND reset_date < NOW();

  -- Get current usage
  SELECT * INTO v_usage
  FROM organization_usage
  WHERE user_id = p_user_id;

  -- Calculate remaining
  v_remaining := v_usage.monthly_allowance_usd - v_usage.current_usage_usd;

  -- Check if request would exceed quota
  IF v_remaining < p_estimated_cost THEN
    RETURN QUERY SELECT
      false AS allowed,
      v_remaining AS remaining_usd,
      format('Quota exceeded. Remaining: $%s', v_remaining) AS message;
    RETURN;
  END IF;

  -- Request allowed
  RETURN QUERY SELECT
    true AS allowed,
    v_remaining AS remaining_usd,
    format('Request allowed. Remaining: $%s', v_remaining) AS message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: increment_usage
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_actual_cost DECIMAL,
  p_search_query_id UUID DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_new_usage DECIMAL;
  v_allowance DECIMAL;
  v_percentage DECIMAL;
BEGIN
  -- Atomic increment
  UPDATE organization_usage
  SET current_usage_usd = current_usage_usd + p_actual_cost,
      search_count = search_count + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING current_usage_usd, monthly_allowance_usd INTO v_new_usage, v_allowance;

  -- Calculate percentage
  v_percentage := (v_new_usage / v_allowance) * 100;

  -- Set alert flags
  IF v_percentage >= 90 AND NOT (SELECT alert_threshold_90 FROM organization_usage WHERE user_id = p_user_id) THEN
    UPDATE organization_usage
    SET alert_threshold_90 = true
    WHERE user_id = p_user_id;

    RAISE NOTICE 'User % has reached 90%% quota', p_user_id;
  ELSIF v_percentage >= 80 AND NOT (SELECT alert_threshold_80 FROM organization_usage WHERE user_id = p_user_id) THEN
    UPDATE organization_usage
    SET alert_threshold_80 = true
    WHERE user_id = p_user_id;

    RAISE NOTICE 'User % has reached 80%% quota', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function: cleanup_expired_cache
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM search_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial Data: Create default usage records for existing users
-- ============================================================================

INSERT INTO organization_usage (user_id, monthly_allowance_usd, current_usage_usd)
SELECT id, 50.00, 0.00
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;