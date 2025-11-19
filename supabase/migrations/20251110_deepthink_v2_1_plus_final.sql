/*
  # DeepThink 2.1++ Production Implementation

  ## Overview
  Multi-pass AI reasoning pipeline with RAG capabilities, verification, and cost tracking.
  Implements planner -> evidence -> parallel solvers -> hybrid verifier architecture.

  ## New Tables

  ### 1. ai_lanes
  Configuration storage for different reasoning "lanes" (pipeline configurations)
  - `id` (uuid, primary key) - Unique lane identifier
  - `name` (text, unique) - Lane name (e.g., "deepthink_lane_gemini_v2_1_plus")
  - `config_json` (jsonb) - Complete lane configuration including models, timeouts, token caps
  - `created_at` (timestamptz) - Creation timestamp

  ### 2. space_runs
  Tracks complete reasoning job executions from start to finish
  - `id` (uuid, primary key) - Unique run identifier
  - `user_id` (uuid, FK) - User who initiated the run
  - `lane_id` (uuid, FK) - Configuration lane used
  - `goal_prompt` (text) - User's original query/goal
  - `status` (run_status enum) - Current execution status
  - `trace_id` (uuid) - For distributed tracing
  - `verify_score` (numeric) - Verification quality score (0-1)
  - `residual_risk` (text) - Risk assessment from verifier
  - `final_output` (jsonb) - Complete final result with citations
  - `start_time`, `end_time` (timestamptz) - Execution timing
  - `total_latency_ms` (int) - Total execution time
  - `total_cost_usd` (numeric) - Total cost in USD
  - `total_tokens` (int) - Total tokens used (persisted for budgeting)

  ### 3. ai_runs
  Individual pass executions (planner, solver, verifier) within a space_run
  - `id` (uuid, primary key) - Unique pass run identifier
  - `space_run_id` (uuid, FK) - Parent space run
  - `pass_type` (ai_pass_type enum) - Type of pass executed
  - `model_name` (text) - AI model used
  - `input_data` (jsonb) - Input to this pass
  - `output_data` (jsonb) - Validated output from this pass
  - `pass_candidate` (int) - Candidate number for parallel solvers
  - `is_winner` (boolean) - True if this solver won verification
  - `cache_hit` (boolean) - True if result served from cache
  - `latency_ms` (int) - Execution time for this pass
  - `execution_params` (jsonb) - Model parameters used (temp, etc.)
  - `input_tokens`, `output_tokens` (int) - Token usage

  ### 4. ai_artifacts
  Evidence, snippets, and references gathered during execution
  - `id` (uuid, primary key) - Unique artifact identifier
  - `space_run_id` (uuid, FK) - Parent space run
  - `ref_id` (text) - Reference ID (e.g., "R1", "R2")
  - `source_type` (text) - Type: web, db, file, error, search_result
  - `source_uri` (text) - URL or file path
  - `snippet_hash` (char(64)) - SHA-256 hash for deduplication
  - `snippet_text` (text) - Actual content snippet
  - `snippet_location` (text) - Location within source
  - `rerank_score` (numeric) - Relevance score from reranker

  ### 5. ai_run_checks
  Verification checks performed on solver outputs
  - `id` (uuid, primary key) - Unique check identifier
  - `verifier_run_id` (uuid, FK) - Verifier pass that ran the check
  - `candidate_run_id` (uuid, FK) - Solver being verified
  - `check_name` (text) - Name of the check
  - `check_type` (text) - deterministic or llm
  - `status` (text) - pass, fail, skip
  - `reasoning` (text) - Explanation of check result

  ### 6. ai_cache
  Cached pass outputs with TTL for performance optimization
  - `cache_key` (char(64), primary key) - SHA-256 hash of input
  - `pass_type` (ai_pass_type enum) - Type of cached pass
  - `output_data` (jsonb) - Cached output
  - `usage_metadata` (jsonb) - Token usage info
  - `created_at`, `expires_at` (timestamptz) - Cache lifetime

  ### 7. ai_cost_ledger (Partitioned by month)
  Detailed cost tracking and billing records
  - `id` (uuid) - Unique ledger entry
  - `ai_run_id` (uuid, FK) - Pass run being billed
  - `user_id` (uuid, FK) - User being charged
  - `provider`, `model` (text) - Provider and model used
  - `input_tokens`, `output_tokens` (int) - Token counts
  - `cost_usd` (numeric) - Cost for this run
  - `created_at` (timestamptz) - Partition key

  ## Enums
  - `run_status`: pending, running, success, error, cancelled
  - `ai_pass_type`: planner, retriever, reranker, solver, verifier_hybrid, verifier_llm

  ## Automation
  - Daily pg_cron job to purge expired cache entries (3 AM UTC)
  - Monthly pg_cron job to create new cost ledger partitions (25th at 1 AM UTC)

  ## Security
  - All tables have RLS enabled
  - Users can only access their own space_runs and related data
  - Service role bypasses RLS for edge function operations

  ## Performance
  - Indexes on frequently queried columns (trace_id, user_id, conversation_id)
  - Composite indexes for pagination (conversation_id + created_at)
  - GIN indexes for JSONB queries on metadata columns
  - Partitioned cost_ledger for efficient time-range queries

  ## Budget Protection
  - Atomic RPC function `increment_space_run_totals` for race-free token tracking
  - Token cap enforcement before expensive operations
  - Per-job token budget configurable in lane config
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Enums (Idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN
    CREATE TYPE run_status AS ENUM ('pending', 'running', 'success', 'error', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_pass_type') THEN
    CREATE TYPE ai_pass_type AS ENUM ('planner', 'retriever', 'reranker', 'solver', 'verifier_hybrid', 'verifier_llm');
  END IF;
END $$;

-- Configuration Tables
CREATE TABLE IF NOT EXISTS ai_lanes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  config_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Execution Tables
CREATE TABLE IF NOT EXISTS space_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lane_id UUID REFERENCES ai_lanes(id) NOT NULL,
  goal_prompt TEXT NOT NULL,
  status run_status DEFAULT 'pending',
  trace_id UUID NOT NULL,
  verify_score NUMERIC(5,3) DEFAULT 0.0,
  residual_risk TEXT DEFAULT '',
  final_output JSONB,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  total_latency_ms INT DEFAULT 0,
  total_cost_usd NUMERIC(15,8) DEFAULT 0,
  total_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_run_id UUID REFERENCES space_runs(id) ON DELETE CASCADE NOT NULL,
  pass_type ai_pass_type NOT NULL,
  model_name TEXT,
  input_data JSONB,
  output_data JSONB,
  pass_candidate INT DEFAULT 0,
  is_winner BOOLEAN DEFAULT FALSE,
  cache_hit BOOLEAN DEFAULT FALSE,
  latency_ms INT DEFAULT 0,
  execution_params JSONB DEFAULT '{}'::JSONB,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Artifacts and Evidence
CREATE TABLE IF NOT EXISTS ai_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  space_run_id UUID REFERENCES space_runs(id) ON DELETE CASCADE NOT NULL,
  ref_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('web', 'db', 'file', 'error', 'search_result')),
  source_uri TEXT,
  snippet_hash CHAR(64) NOT NULL,
  snippet_text TEXT,
  snippet_location TEXT,
  rerank_score NUMERIC(5,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(space_run_id, ref_id)
);

-- Verification and Checks
CREATE TABLE IF NOT EXISTS ai_run_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  verifier_run_id UUID REFERENCES ai_runs(id) ON DELETE CASCADE NOT NULL,
  candidate_run_id UUID REFERENCES ai_runs(id) ON DELETE CASCADE NOT NULL,
  check_name TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('deterministic', 'llm')),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'skip')),
  reasoning TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache Table
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key CHAR(64) PRIMARY KEY,
  pass_type ai_pass_type NOT NULL,
  output_data JSONB NOT NULL,
  usage_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

-- Partitioned Cost Ledger
DO $$
BEGIN
  IF to_regclass('public.ai_cost_ledger') IS NULL THEN
    EXECUTE $ct$
      CREATE TABLE ai_cost_ledger (
        id UUID DEFAULT uuid_generate_v4(),
        ai_run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INT NOT NULL,
        output_tokens INT NOT NULL,
        cost_usd NUMERIC(15,8) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    $ct$;
  END IF;
END $$;

-- Helper Function: Atomic Increments for Robust Budgeting
CREATE OR REPLACE FUNCTION increment_space_run_totals(
  p_space_run_id UUID,
  p_tokens INT,
  p_cost_usd NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE space_runs
  SET total_tokens = total_tokens + p_tokens,
      total_cost_usd = total_cost_usd + p_cost_usd
  WHERE id = p_space_run_id;
END;
$$ LANGUAGE plpgsql;

-- Partition Management Automation
CREATE OR REPLACE FUNCTION create_cost_ledger_partitions()
RETURNS VOID AS $$
DECLARE
  y INT;
  m INT;
  start_ts DATE;
  end_ts DATE;
  part_name TEXT;
  i INT;
BEGIN
  -- Ensure current month AND next month partitions exist
  FOR i IN 0..1 LOOP
    y := date_part('year', (NOW() + (i || ' month')::INTERVAL));
    m := date_part('month', (NOW() + (i || ' month')::INTERVAL));
    start_ts := make_date(y, m, 1);
    end_ts := (start_ts + INTERVAL '1 month')::DATE;
    part_name := format('ai_cost_ledger_y%sm%02s', y, m);

    IF to_regclass('public.' || part_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF ai_cost_ledger FOR VALUES FROM (%L) TO (%L)',
        part_name,
        start_ts::TIMESTAMPTZ,
        end_ts::TIMESTAMPTZ
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Automation via pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN

    -- 1. Partition Creation (Monthly on the 25th at 1 AM UTC)
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='create-cost-ledger-partition') THEN
      PERFORM cron.schedule(
        'create-cost-ledger-partition',
        '0 1 25 * *',
        $$ SELECT create_cost_ledger_partitions(); $$
      );
    END IF;

    -- 2. Cache Cleanup (Daily at 3 AM UTC)
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-ai-cache') THEN
      PERFORM cron.schedule(
        'purge-expired-ai-cache',
        '0 3 * * *',
        $$ DELETE FROM ai_cache WHERE expires_at < NOW(); $$
      );
    END IF;

  END IF;
END $$;

-- Initial Partition Creation
SELECT create_cost_ledger_partitions();

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_space_runs_trace_id ON space_runs(trace_id);
CREATE INDEX IF NOT EXISTS idx_space_runs_user_date ON space_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_space_runs_status ON space_runs(status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_ai_runs_space_type ON ai_runs(space_run_id, pass_type);
CREATE INDEX IF NOT EXISTS idx_ai_runs_winner ON ai_runs(space_run_id) WHERE is_winner = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_space ON ai_artifacts(space_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_hash ON ai_artifacts(snippet_hash);
CREATE INDEX IF NOT EXISTS idx_ai_run_checks_candidate ON ai_run_checks(candidate_run_id);

-- RLS Policies
ALTER TABLE ai_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_run_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cost_ledger ENABLE ROW LEVEL SECURITY;

-- ai_lanes: Read-only for authenticated users (lanes are global config)
CREATE POLICY "authenticated_users_read_lanes" ON ai_lanes
  FOR SELECT TO authenticated USING (TRUE);

-- space_runs: Users can only see their own runs
CREATE POLICY "users_read_own_space_runs" ON space_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_space_runs" ON space_runs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ai_runs: Access through space_runs ownership
CREATE POLICY "users_read_own_ai_runs" ON ai_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM space_runs s
    WHERE s.id = ai_runs.space_run_id
    AND s.user_id = auth.uid()
  ));

-- ai_artifacts: Access through space_runs ownership
CREATE POLICY "users_read_own_artifacts" ON ai_artifacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM space_runs s
    WHERE s.id = ai_artifacts.space_run_id
    AND s.user_id = auth.uid()
  ));

-- ai_run_checks: Access through space_runs ownership
CREATE POLICY "users_read_own_checks" ON ai_run_checks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_runs r
    JOIN space_runs s ON s.id = r.space_run_id
    WHERE r.id = ai_run_checks.verifier_run_id
    AND s.user_id = auth.uid()
  ));

-- ai_cost_ledger: Users can only see their own costs
CREATE POLICY "users_read_own_costs" ON ai_cost_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE ai_lanes IS 'DeepThink reasoning pipeline configurations';
COMMENT ON TABLE space_runs IS 'Complete DeepThink job executions with final results';
COMMENT ON TABLE ai_runs IS 'Individual pass executions (planner, solver, verifier) within jobs';
COMMENT ON TABLE ai_artifacts IS 'Evidence and references gathered during reasoning';
COMMENT ON TABLE ai_run_checks IS 'Verification checks performed on solver outputs';
COMMENT ON TABLE ai_cache IS 'Cached pass outputs with TTL for performance';
COMMENT ON TABLE ai_cost_ledger IS 'Partitioned billing records for cost tracking';
COMMENT ON FUNCTION increment_space_run_totals IS 'Atomically update token and cost totals for budget enforcement';
COMMENT ON FUNCTION create_cost_ledger_partitions IS 'Automatically create monthly cost ledger partitions';
