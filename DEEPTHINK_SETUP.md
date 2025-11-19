# DeepThink 2.1++ Setup Guide

## Overview

DeepThink 2.1++ is a production-ready multi-pass AI reasoning system that provides deep, verified answers to complex queries. It uses a three-phase architecture: Planning → Evidence Gathering → Parallel Solving with Verification.

## Architecture

```
User Query
    ↓
[Planner] → Structured approach with caching
    ↓
[Evidence Gatherer] → Search API + Basic Reranker (optional)
    ↓
[3 Parallel Solvers] → Different temperatures for diversity
    ↓
[Hybrid Verifier] → Deterministic + LLM checks
    ↓
Winner Selected (Early Exit) → Final output with citations
```

## Prerequisites

1. **Supabase Account** - Already configured ✓
2. **Google AI Studio Account** - Get Gemini API key from https://makersuite.google.com/app/apikey
3. **Search API** (Optional) - Recommended: Brave Search API (https://brave.com/search/api/)
4. **PostgreSQL with pg_cron** - Should be available in Supabase ✓

## Setup Steps

### 1. Apply Database Migration

The migration file has been created at:
```
supabase/migrations/20251110_deepthink_v2_1_plus_final.sql
```

To apply it:
```bash
# If using Supabase CLI locally
supabase db push

# Or apply via Supabase Dashboard:
# 1. Go to your project dashboard
# 2. Navigate to Database > Migrations
# 3. Create new migration and paste the content
# 4. Run the migration
```

This migration creates:
- 7 new tables (ai_lanes, space_runs, ai_runs, ai_artifacts, ai_run_checks, ai_cache, ai_cost_ledger)
- 2 enums (run_status, ai_pass_type)
- RLS policies for security
- Automated pg_cron jobs for cache cleanup and partition management
- Performance indexes

### 2. Configure Environment Variables

Add these to your Supabase Edge Function environment:

**Required:**
```bash
GEMINI_API_KEY=your-api-key-here
GEMINI_RATE_IN_USD_PER_MTOK=1.25
GEMINI_RATE_OUT_USD_PER_MTOK=10.00
```

Get your Gemini API key from: https://makersuite.google.com/app/apikey

**Optional (for evidence gathering):**
```bash
SEARCH_API_URL=https://api.search.brave.com/res/v1/web/search
SEARCH_API_KEY=your-brave-api-key
```

Get Brave Search API key from: https://brave.com/search/api/

To set environment variables in Supabase:
1. Go to Project Settings → Edge Functions
2. Add the secrets
3. Redeploy functions

### 3. Deploy Edge Function

```bash
# Using Supabase CLI
supabase functions deploy deepthink

# Or deploy via Dashboard:
# 1. Go to Edge Functions
# 2. Create new function named "deepthink"
# 3. Upload the files from supabase/functions/deepthink/
```

### 4. Insert Lane Configuration

Run this SQL in your Supabase SQL Editor:

```sql
-- Insert the DeepThink lane configuration
INSERT INTO ai_lanes (name, config_json)
VALUES (
  'deepthink_lane_gemini_v2_1_plus',
  '{
    "name": "deepthink_lane_gemini_v2_1_plus",
    "provider": "gemini",
    "schema_version": "2.1++",
    "passes": {
      "planner": {
        "model": "gemini-2.0-flash-exp",
        "cap_tokens": 6000,
        "timeout_ms": 10000,
        "params": {"temperature": 0.0},
        "cache_ttl_seconds": 604800
      },
      "solver": {
        "model": "gemini-2.0-flash-exp",
        "cap_tokens": 24000,
        "timeout_ms": 20000,
        "parallel": 3,
        "params_variants": [
          {"temperature": 0.3},
          {"temperature": 0.5},
          {"temperature": 0.7}
        ]
      },
      "verifier": {
        "model": "gemini-2.0-flash-thinking-exp",
        "cap_tokens": 12000,
        "timeout_ms": 15000,
        "params": {"temperature": 0.0},
        "threshold": 0.8
      }
    },
    "tools_allowlist": {
      "web": [],
      "db": [],
      "file": ["pdf", "md", "txt", "json", "yaml", "ts", "tsx", "js", "jsx", "py", "sql"]
    },
    "retry_policy": {
      "solver": {
        "max_attempts": 2,
        "backoff_ms": [500],
        "retryable_errors": ["rate_limit", "transient_provider_error", "schema_mismatch"]
      }
    },
    "per_job_token_cap": 95000
  }'::jsonb
)
ON CONFLICT (name) DO UPDATE SET config_json = EXCLUDED.config_json;
```

### 5. Verify Installation

Check that everything is working:

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'ai_%' OR table_name = 'space_runs';

-- Verify pg_cron jobs are scheduled
SELECT * FROM cron.job WHERE jobname LIKE '%deepthink%' OR jobname LIKE '%cost-ledger%' OR jobname LIKE '%cache%';

-- Verify lane configuration
SELECT name, schema_version FROM ai_lanes;

-- Check partitions were created
SELECT tablename FROM pg_tables WHERE tablename LIKE 'ai_cost_ledger_%';
```

## Usage

### Creating a DeepThink Run

1. **Create a space_run record:**

```typescript
const { data: lane } = await supabase
  .from('ai_lanes')
  .select('id')
  .eq('name', 'deepthink_lane_gemini_v2_1_plus')
  .single();

const { data: spaceRun } = await supabase
  .from('space_runs')
  .insert({
    user_id: userId,
    lane_id: lane.id,
    goal_prompt: userGoal,
    status: 'pending',
    trace_id: crypto.randomUUID()
  })
  .select()
  .single();
```

2. **Call the edge function:**

```typescript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/deepthink`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      goal: userGoal,
      space_run_id: spaceRun.id
    })
  }
);

// Handle SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('event:')) {
      const event = line.slice(6);
      // Handle different events: plan, evidence, candidate, final, error, done
    }
    if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(5));
      // Process event data
    }
  }
}
```

### Event Types

The SSE stream emits these events:

- `progress`: Progress updates (planning, evidence, solving, verifying)
- `plan`: Structured plan from planner phase
- `evidence`: Evidence snippets gathered (if applicable)
- `candidate`: Solver candidate progress
- `candidate_rejected`: When a candidate fails checks
- `final`: Final verified result (winner found!)
- `error`: Error occurred
- `done`: Execution complete

## Cost Tracking

All costs are automatically tracked in the `ai_cost_ledger` table:

```sql
-- View total costs by user
SELECT
  user_id,
  SUM(cost_usd) as total_cost,
  SUM(input_tokens + output_tokens) as total_tokens
FROM ai_cost_ledger
GROUP BY user_id;

-- View costs for a specific run
SELECT
  ar.pass_type,
  ar.model_name,
  acl.input_tokens,
  acl.output_tokens,
  acl.cost_usd
FROM ai_cost_ledger acl
JOIN ai_runs ar ON ar.id = acl.ai_run_id
WHERE ar.space_run_id = 'your-space-run-id';
```

## Monitoring

### Metrics Endpoint

```bash
curl https://your-project.supabase.co/functions/v1/deepthink/metrics
```

Returns Prometheus-formatted metrics:
- `deepthink_runs_total` - Total runs executed
- `deepthink_cache_hits_total` - Cache hit rate
- `deepthink_budget_breach_total` - Budget violations
- `deepthink_early_exit_total` - Early exits (winner found)
- `deepthink_tokens_total` - Total tokens consumed
- `deepthink_cost_usd_total` - Total cost
- `deepthink_latency_ms_p95` - 95th percentile latency
- `deepthink_verification_score_gauge` - Latest verification score

### Database Monitoring

```sql
-- Active runs
SELECT id, goal_prompt, status, start_time, total_tokens, total_cost_usd
FROM space_runs
WHERE status = 'running';

-- Recent completed runs with scores
SELECT
  id,
  goal_prompt,
  verify_score,
  residual_risk,
  total_latency_ms,
  total_cost_usd,
  end_time
FROM space_runs
WHERE status = 'success'
ORDER BY end_time DESC
LIMIT 10;

-- Cache effectiveness
SELECT
  pass_type,
  COUNT(*) as entries,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active
FROM ai_cache
GROUP BY pass_type;
```

## Troubleshooting

### Common Issues

**1. "GEMINI_API_KEY not configured"**
- Ensure you've set the environment variable in Supabase Edge Functions settings
- Redeploy the function after setting variables

**2. "token_cap_breach"**
- Increase `per_job_token_cap` in the lane configuration
- Or optimize your goal to require fewer tokens

**3. "all_candidates_failed_verification"**
- The goal might be too ambiguous
- Lower the verification threshold in lane config
- Check verification logs in `ai_run_checks` table

**4. No evidence gathered**
- `SEARCH_API_URL` and `SEARCH_API_KEY` are not configured
- This is optional - the system works without evidence

**5. pg_cron jobs not running**
- Verify pg_cron extension is installed: `SELECT * FROM pg_extension WHERE extname='pg_cron';`
- Check job status: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Debug Logs

Check Supabase Edge Function logs:
1. Go to Edge Functions → deepthink
2. View Logs tab
3. Look for [DeepThink] prefixed messages

## Configuration Options

### Lane Configuration

Edit the lane configuration to tune behavior:

```sql
UPDATE ai_lanes
SET config_json = jsonb_set(
  config_json,
  '{passes,verifier,threshold}',
  '0.7'::jsonb
)
WHERE name = 'deepthink_lane_gemini_v2_1_plus';
```

Key parameters:
- `passes.solver.parallel` - Number of parallel solutions (1-5)
- `passes.verifier.threshold` - Acceptance threshold (0.0-1.0)
- `per_job_token_cap` - Maximum tokens per job
- `passes.planner.cache_ttl_seconds` - Plan cache duration

### Search Allowlist

If using search API, populate the allowlist:

```sql
UPDATE ai_lanes
SET config_json = jsonb_set(
  config_json,
  '{tools_allowlist,web}',
  '["arxiv.org", "wikipedia.org", "github.com"]'::jsonb
)
WHERE name = 'deepthink_lane_gemini_v2_1_plus';
```

## Next Steps

1. **Build Frontend Interface** - Create UI components to trigger DeepThink runs
2. **Set up Monitoring** - Configure alerts for budget breaches and failures
3. **Optimize Costs** - Adjust token caps and caching based on usage patterns
4. **Tune Verification** - Adjust threshold based on quality requirements

## Support

For issues or questions:
- Check the troubleshooting section above
- Review Edge Function logs in Supabase Dashboard
- Inspect database records in `space_runs` and `ai_runs` tables
