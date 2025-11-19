# DeepThink 2.1++ Deployment Checklist

## Pre-Deployment Setup

### 1. Get API Keys

- [ ] **Gemini API Key**
  - Go to https://makersuite.google.com/app/apikey
  - Create new API key
  - Save securely

- [ ] **Search API Key** (Optional but recommended)
  - Go to https://brave.com/search/api/
  - Sign up for API access
  - Get subscription token
  - Save securely

### 2. Check Supabase Project

- [ ] Verify pg_cron extension is installed
  ```sql
  SELECT * FROM pg_extension WHERE extname='pg_cron';
  ```
  - If not installed, contact Supabase support or enable via dashboard

- [ ] Check service role key is available
  - Project Settings → API → service_role key

## Database Setup

### 3. Apply Migration

- [ ] Open Supabase SQL Editor
- [ ] Copy content from `supabase/migrations/20251110_deepthink_v2_1_plus_final.sql`
- [ ] Execute the migration
- [ ] Verify tables created:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND (table_name LIKE 'ai_%' OR table_name = 'space_runs')
  ORDER BY table_name;
  ```
  Expected: 7 tables (ai_artifacts, ai_cache, ai_cost_ledger, ai_lanes, ai_run_checks, ai_runs, space_runs)

### 4. Verify Automation

- [ ] Check pg_cron jobs scheduled:
  ```sql
  SELECT jobname, schedule, command
  FROM cron.job
  WHERE jobname IN ('create-cost-ledger-partition', 'purge-expired-ai-cache');
  ```
  Expected: 2 jobs

- [ ] Verify initial partition created:
  ```sql
  SELECT tablename FROM pg_tables
  WHERE tablename LIKE 'ai_cost_ledger_%';
  ```
  Expected: At least 1 partition for current month

### 5. Insert Lane Configuration

- [ ] Execute this SQL:
  ```sql
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

- [ ] Verify insertion:
  ```sql
  SELECT name, config_json->>'schema_version' as version
  FROM ai_lanes
  WHERE name = 'deepthink_lane_gemini_v2_1_plus';
  ```

## Edge Function Deployment

### 6. Configure Environment Variables

- [ ] Go to Supabase Dashboard → Edge Functions
- [ ] Add environment secrets:
  - `GEMINI_API_KEY` = your-gemini-key
  - `GEMINI_RATE_IN_USD_PER_MTOK` = 1.25
  - `GEMINI_RATE_OUT_USD_PER_MTOK` = 10.00

- [ ] Optional (for evidence gathering):
  - `SEARCH_API_URL` = https://api.search.brave.com/res/v1/web/search
  - `SEARCH_API_KEY` = your-brave-key

### 7. Deploy Edge Function

Using Supabase CLI:
```bash
supabase functions deploy deepthink
```

Or via Dashboard:
- [ ] Go to Edge Functions
- [ ] Create new function named "deepthink"
- [ ] Upload files from `supabase/functions/deepthink/`
- [ ] Deploy

### 8. Verify Deployment

- [ ] Check function is active in dashboard
- [ ] Test health endpoint:
  ```bash
  curl https://your-project.supabase.co/functions/v1/deepthink/metrics
  ```
  Expected: Prometheus-formatted metrics

## Frontend Integration

### 9. Integrate Component

- [ ] Follow steps in `DEEPTHINK_INTEGRATION_GUIDE.md`
- [ ] Add DeepThink button to sidebar
- [ ] Update App.tsx to conditionally render DeepThinkInterface
- [ ] Test navigation between chat and DeepThink modes

### 10. Build and Deploy Frontend

- [ ] Run `npm run build`
- [ ] Deploy to your hosting platform
- [ ] Verify deployment

## Testing

### 11. End-to-End Test

- [ ] Login to application
- [ ] Navigate to DeepThink space
- [ ] Submit test query:
  ```
  Design a scalable architecture for a real-time collaborative code editor
  that supports 1000+ concurrent users. Consider performance, conflict
  resolution, data persistence, and cost optimization.
  ```

- [ ] Verify phases execute:
  - [ ] Planning phase shows structured plan
  - [ ] Evidence gathering (if search API configured)
  - [ ] Solving phase shows candidates
  - [ ] Verification phase runs
  - [ ] Final result displayed with citations

- [ ] Check database records:
  ```sql
  SELECT * FROM space_runs ORDER BY created_at DESC LIMIT 1;
  SELECT * FROM ai_runs WHERE space_run_id = 'latest-run-id';
  SELECT * FROM ai_cost_ledger WHERE ai_run_id IN (SELECT id FROM ai_runs WHERE space_run_id = 'latest-run-id');
  ```

### 12. Verify Cost Tracking

- [ ] Check costs were recorded:
  ```sql
  SELECT
    sr.goal_prompt,
    sr.total_tokens,
    sr.total_cost_usd,
    sr.verify_score
  FROM space_runs sr
  WHERE sr.status = 'success'
  ORDER BY sr.created_at DESC
  LIMIT 5;
  ```

### 13. Test Error Handling

- [ ] Submit invalid query (empty string)
  - Should show error message

- [ ] Submit very complex query to exceed budget
  - Should hit budget cap gracefully

- [ ] Check error logs in Edge Functions dashboard

## Monitoring Setup

### 14. Set Up Monitoring

- [ ] Bookmark metrics endpoint:
  `https://your-project.supabase.co/functions/v1/deepthink/metrics`

- [ ] Create dashboard queries:
  ```sql
  -- Success rate
  SELECT
    status,
    COUNT(*) as count
  FROM space_runs
  GROUP BY status;

  -- Average costs
  SELECT
    AVG(total_cost_usd) as avg_cost,
    AVG(total_tokens) as avg_tokens,
    AVG(total_latency_ms / 1000.0) as avg_seconds
  FROM space_runs
  WHERE status = 'success';

  -- Verification scores
  SELECT
    AVG(verify_score) as avg_score,
    MIN(verify_score) as min_score,
    MAX(verify_score) as max_score
  FROM space_runs
  WHERE status = 'success' AND verify_score > 0;
  ```

### 15. Set Up Alerts (Optional)

- [ ] Configure alerts for:
  - Budget breaches
  - High error rates
  - Low verification scores
  - Cost anomalies

## Documentation

### 16. Team Onboarding

- [ ] Share these documents with team:
  - `DEEPTHINK_SETUP.md` - Setup guide
  - `DEEPTHINK_INTEGRATION_GUIDE.md` - Frontend integration
  - `DEEPTHINK_SUMMARY.md` - Overview and architecture

- [ ] Document your specific configuration:
  - API keys location
  - Monitoring dashboard URLs
  - Cost budget policies
  - Support contacts

## Post-Deployment

### 17. Initial Tuning

After first 10-20 queries:

- [ ] Review verification threshold
  - If too many failures: lower threshold
  - If accepting low quality: raise threshold

- [ ] Review token budgets
  - If hitting cap frequently: increase budget
  - If mostly unused: decrease budget

- [ ] Review cache effectiveness
  ```sql
  SELECT pass_type, COUNT(*) as cached_entries
  FROM ai_cache
  WHERE expires_at > NOW()
  GROUP BY pass_type;
  ```

### 18. Cost Analysis

- [ ] Review actual costs vs projections
- [ ] Set user budgets if needed
- [ ] Adjust pricing for your use case

### 19. User Feedback

- [ ] Collect feedback on:
  - Result quality
  - Response time
  - Usefulness vs regular chat
  - Feature requests

### 20. Production Readiness Sign-Off

- [ ] All tests passing
- [ ] Monitoring configured
- [ ] Documentation complete
- [ ] Team trained
- [ ] Cost controls in place
- [ ] Backup plan for failures

---

## Quick Reference

**Metrics Endpoint:**
```
GET https://your-project.supabase.co/functions/v1/deepthink/metrics
```

**Cost Query:**
```sql
SELECT SUM(cost_usd) FROM ai_cost_ledger WHERE user_id = 'user-id';
```

**Recent Runs:**
```sql
SELECT * FROM space_runs ORDER BY created_at DESC LIMIT 10;
```

**Cache Stats:**
```sql
SELECT pass_type, COUNT(*) FROM ai_cache GROUP BY pass_type;
```

---

## Support Contacts

- **Supabase Support**: support@supabase.io
- **Google AI Studio**: https://ai.google.dev/support
- **Brave Search API**: support@brave.com

---

## Rollback Plan

If issues occur:

1. **Disable frontend navigation to DeepThink**
2. **Keep database tables** (data preserved for analysis)
3. **Review logs** to identify issue
4. **Fix and redeploy**

Do NOT drop tables without backup - cost tracking data is valuable!

---

**Checklist Complete?** ✅

You're ready for production! 🎉
