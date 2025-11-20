/*
  # Rollback Overengineered Observability Tables

  This migration removes the overengineered observability infrastructure
  in favor of a minimal tracing core (3 tables).

  ## Tables Dropped
  - request_traces (replaced by request_contexts)
  - function_call_logs (replaced by provider_calls)
  - constraint_violations (replaced by verification_results)
  - lane_contexts (constraints moved to code)
  - lane_transitions (not needed yet)
  - cross_lane_contamination_alerts (not needed yet)
  - provider_response_schemas (validation moved to code)
  - provider_schema_violations (replaced by verification_results)
  - provider_reliability_metrics (can derive from provider_calls)
  - verification_rule_executions (not needed yet)
  - lane_quotas (defer until needed)
  - cost_allocation (can derive from provider_calls)
  - quota_alerts (defer until needed)
  - verification_rules (rules defined in code for now)

  ## What Remains
  - Existing ai_conversations, ai_messages, search_queries (already have correlation_id)
  - Will add: request_contexts, provider_calls, verification_results (minimal core)
*/

-- Drop overengineered tables in reverse dependency order

-- Cost/quota tables
DROP TABLE IF EXISTS quota_alerts CASCADE;
DROP TABLE IF EXISTS cost_allocation CASCADE;
DROP TABLE IF EXISTS lane_quotas CASCADE;

-- Verification tables
DROP TABLE IF EXISTS verification_results CASCADE;
DROP TABLE IF EXISTS verification_rule_executions CASCADE;
DROP TABLE IF EXISTS verification_rules CASCADE;

-- Provider contract tables
DROP TABLE IF EXISTS provider_reliability_metrics CASCADE;
DROP TABLE IF EXISTS provider_schema_violations CASCADE;
DROP TABLE IF EXISTS provider_response_schemas CASCADE;

-- Lane boundary tables
DROP TABLE IF EXISTS cross_lane_contamination_alerts CASCADE;
DROP TABLE IF EXISTS lane_transitions CASCADE;
DROP TABLE IF EXISTS lane_contexts CASCADE;

-- Request tracing tables
DROP TABLE IF EXISTS constraint_violations CASCADE;
DROP TABLE IF EXISTS function_call_logs CASCADE;
DROP TABLE IF EXISTS request_contexts CASCADE;
DROP TABLE IF EXISTS request_traces CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS update_request_trace_status(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS append_function_to_chain(UUID, TEXT);
DROP FUNCTION IF EXISTS get_request_trace(UUID);
DROP FUNCTION IF EXISTS validate_lane_context(TEXT, JSONB);
DROP FUNCTION IF EXISTS log_lane_transition(UUID, TEXT, TEXT, JSONB, JSONB, UUID);
DROP FUNCTION IF EXISTS get_provider_schema(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS log_schema_violation(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS refresh_provider_reliability_metrics(INTEGER);
DROP FUNCTION IF EXISTS upsert_request_context(UUID, UUID, TEXT, JSONB, TEXT, UUID, TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS get_request_context(UUID);
DROP FUNCTION IF EXISTS validate_context_for_lane(UUID);
DROP FUNCTION IF EXISTS get_full_request_data(UUID);
DROP FUNCTION IF EXISTS cleanup_expired_contexts();
DROP FUNCTION IF EXISTS get_applicable_rules(JSONB);
DROP FUNCTION IF EXISTS log_verification_result(UUID, UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS check_lane_quota(UUID, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS track_lane_cost(UUID, UUID, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_lane_cost_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);