/*
  # Enhanced Cost and Quota Tracking with Lane-Specific Limits

  This migration extends the existing cost tracking system with lane-specific quotas,
  cost allocation by vertical, and real-time quota enforcement.

  ## Tables Created/Modified

  1. lane_quotas
     - Defines separate quota limits per lane (chat, recruiting, sports)
     - Enables fine-grained cost control by vertical
     - Supports different quota periods (daily, weekly, monthly)

  2. cost_allocation
     - Tracks costs by lane, provider, feature
     - Links to correlation_id for full traceability
     - Enables cost analysis and optimization

  3. quota_alerts
     - Logs when users approach lane-specific limits
     - Configurable thresholds (50%, 80%, 90%, 100%)
     - Supports notifications and auto-blocking

  ## Security
  - All tables have RLS enabled
  - Users can view their own quotas and costs
  - Service role manages quota enforcement

  ## Performance
  - Indexes on user_id and lane for fast quota checks
  - Indexes on period_start for time-based queries
  - Real-time quota check functions
*/

-- ============================================================================
-- Table: lane_quotas
-- ============================================================================

CREATE TABLE IF NOT EXISTS lane_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lane identification
  lane_name TEXT NOT NULL, -- 'chat', 'recruiting_general', 'recruiting_clinician', 'sports'
  
  -- Quota limits
  quota_type TEXT NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'custom'
  limit_usd DECIMAL(10, 6) NOT NULL,
  limit_requests INTEGER, -- Optional request count limit
  
  -- Period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Current usage
  used_usd DECIMAL(10, 6) DEFAULT 0.00,
  used_requests INTEGER DEFAULT 0,
  
  -- Alert tracking
  alert_50_triggered BOOLEAN DEFAULT false,
  alert_50_triggered_at TIMESTAMPTZ,
  alert_80_triggered BOOLEAN DEFAULT false,
  alert_80_triggered_at TIMESTAMPTZ,
  alert_90_triggered BOOLEAN DEFAULT false,
  alert_90_triggered_at TIMESTAMPTZ,
  alert_100_triggered BOOLEAN DEFAULT false,
  alert_100_triggered_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  auto_block_at_limit BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, lane_name, period_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lane_quotas_user_lane ON lane_quotas(user_id, lane_name);
CREATE INDEX IF NOT EXISTS idx_lane_quotas_period ON lane_quotas(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_lane_quotas_active ON lane_quotas(is_active);

-- RLS Policies
ALTER TABLE lane_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lane quotas"
  ON lane_quotas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage lane quotas"
  ON lane_quotas FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Table: cost_allocation
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Allocation dimensions
  lane_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model_name TEXT,
  feature_name TEXT, -- 'chat', 'search', 'deepthink', 'image_vision', 'memory_lanes'
  
  -- Context
  conversation_id UUID,
  space_id UUID,
  clinician_id UUID,
  
  -- Cost breakdown
  cost_usd DECIMAL(10, 6) NOT NULL,
  cost_breakdown JSONB DEFAULT '{}'::jsonb, -- Detailed cost components
  
  -- Usage metrics
  tokens_input INTEGER,
  tokens_output INTEGER,
  api_calls INTEGER DEFAULT 1,
  
  -- Performance
  latency_ms INTEGER,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_allocation_correlation ON cost_allocation(correlation_id);
CREATE INDEX IF NOT EXISTS idx_cost_allocation_user_created ON cost_allocation(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_allocation_lane ON cost_allocation(lane_name);
CREATE INDEX IF NOT EXISTS idx_cost_allocation_provider ON cost_allocation(provider_name);
CREATE INDEX IF NOT EXISTS idx_cost_allocation_feature ON cost_allocation(feature_name);
CREATE INDEX IF NOT EXISTS idx_cost_allocation_conversation ON cost_allocation(conversation_id);

-- RLS Policies
ALTER TABLE cost_allocation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cost allocation"
  ON cost_allocation FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert cost allocation"
  ON cost_allocation FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Table: quota_alerts
-- ============================================================================

CREATE TABLE IF NOT EXISTS quota_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Alert details
  lane_name TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'approaching_limit', 'limit_reached', 'limit_exceeded'
  threshold_percentage INTEGER NOT NULL, -- 50, 80, 90, 100
  
  -- Quota status at alert time
  current_usage_usd DECIMAL(10, 6) NOT NULL,
  limit_usd DECIMAL(10, 6) NOT NULL,
  remaining_usd DECIMAL(10, 6) NOT NULL,
  usage_percentage DECIMAL(5, 2) NOT NULL,
  
  -- Period context
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Alert actions
  user_notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  notification_method TEXT, -- 'email', 'in_app', 'webhook'
  requests_blocked BOOLEAN DEFAULT false,
  
  -- Alert metadata
  triggered_by_request_id UUID,
  correlation_id UUID,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quota_alerts_user_created ON quota_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_lane ON quota_alerts(lane_name);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_type ON quota_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_threshold ON quota_alerts(threshold_percentage);
CREATE INDEX IF NOT EXISTS idx_quota_alerts_notified ON quota_alerts(user_notified);

-- RLS Policies
ALTER TABLE quota_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quota alerts"
  ON quota_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert quota alerts"
  ON quota_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to check lane quota before request
CREATE OR REPLACE FUNCTION check_lane_quota(
  p_user_id UUID,
  p_lane_name TEXT,
  p_estimated_cost_usd DECIMAL DEFAULT 0.01
)
RETURNS TABLE(
  quota_available BOOLEAN,
  remaining_usd DECIMAL,
  usage_percentage DECIMAL,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quota lane_quotas%ROWTYPE;
  v_current_period_start TIMESTAMPTZ;
  v_usage_pct DECIMAL;
BEGIN
  -- Get current period start (start of current month)
  v_current_period_start := date_trunc('month', NOW());
  
  -- Get active quota for this lane and period
  SELECT * INTO v_quota
  FROM lane_quotas
  WHERE user_id = p_user_id
    AND lane_name = p_lane_name
    AND period_start = v_current_period_start
    AND is_active = true;
  
  -- If no quota exists, create default quota
  IF NOT FOUND THEN
    INSERT INTO lane_quotas (
      user_id,
      lane_name,
      quota_type,
      limit_usd,
      period_start,
      period_end
    ) VALUES (
      p_user_id,
      p_lane_name,
      'monthly',
      10.00, -- Default $10/month per lane
      v_current_period_start,
      v_current_period_start + interval '1 month'
    )
    RETURNING * INTO v_quota;
  END IF;
  
  -- Calculate usage percentage
  v_usage_pct := CASE WHEN v_quota.limit_usd > 0
    THEN ROUND((v_quota.used_usd / v_quota.limit_usd) * 100, 2)
    ELSE 0
  END;
  
  -- Check if quota would be exceeded
  IF (v_quota.used_usd + p_estimated_cost_usd) > v_quota.limit_usd THEN
    RETURN QUERY SELECT
      false,
      v_quota.limit_usd - v_quota.used_usd,
      v_usage_pct,
      format('Lane quota exceeded. Used: $%s / $%s', v_quota.used_usd, v_quota.limit_usd);
    RETURN;
  END IF;
  
  -- Quota available
  RETURN QUERY SELECT
    true,
    v_quota.limit_usd - v_quota.used_usd,
    v_usage_pct,
    'Quota available'::TEXT;
END;
$$;

-- Function to track cost and update quota
CREATE OR REPLACE FUNCTION track_lane_cost(
  p_correlation_id UUID,
  p_user_id UUID,
  p_lane_name TEXT,
  p_mode TEXT,
  p_provider_name TEXT,
  p_feature_name TEXT,
  p_cost_usd DECIMAL,
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allocation_id UUID;
  v_current_period_start TIMESTAMPTZ;
  v_quota lane_quotas%ROWTYPE;
  v_new_usage_pct DECIMAL;
BEGIN
  -- Insert cost allocation record
  INSERT INTO cost_allocation (
    correlation_id,
    user_id,
    lane_name,
    mode,
    provider_name,
    feature_name,
    cost_usd,
    tokens_input,
    tokens_output
  ) VALUES (
    p_correlation_id,
    p_user_id,
    p_lane_name,
    p_mode,
    p_provider_name,
    p_feature_name,
    p_cost_usd,
    p_tokens_input,
    p_tokens_output
  )
  RETURNING id INTO v_allocation_id;
  
  -- Update lane quota
  v_current_period_start := date_trunc('month', NOW());
  
  UPDATE lane_quotas
  SET
    used_usd = used_usd + p_cost_usd,
    used_requests = used_requests + 1,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND lane_name = p_lane_name
    AND period_start = v_current_period_start
    AND is_active = true
  RETURNING * INTO v_quota;
  
  -- Check if we should trigger alerts
  IF FOUND THEN
    v_new_usage_pct := CASE WHEN v_quota.limit_usd > 0
      THEN ROUND((v_quota.used_usd / v_quota.limit_usd) * 100, 2)
      ELSE 0
    END;
    
    -- 50% alert
    IF v_new_usage_pct >= 50 AND NOT v_quota.alert_50_triggered THEN
      UPDATE lane_quotas
      SET alert_50_triggered = true, alert_50_triggered_at = NOW()
      WHERE id = v_quota.id;
      
      INSERT INTO quota_alerts (user_id, lane_name, alert_type, threshold_percentage, current_usage_usd, limit_usd, remaining_usd, usage_percentage, period_start, period_end, correlation_id)
      VALUES (p_user_id, p_lane_name, 'approaching_limit', 50, v_quota.used_usd, v_quota.limit_usd, v_quota.limit_usd - v_quota.used_usd, v_new_usage_pct, v_quota.period_start, v_quota.period_end, p_correlation_id);
    END IF;
    
    -- 80% alert
    IF v_new_usage_pct >= 80 AND NOT v_quota.alert_80_triggered THEN
      UPDATE lane_quotas
      SET alert_80_triggered = true, alert_80_triggered_at = NOW()
      WHERE id = v_quota.id;
      
      INSERT INTO quota_alerts (user_id, lane_name, alert_type, threshold_percentage, current_usage_usd, limit_usd, remaining_usd, usage_percentage, period_start, period_end, correlation_id)
      VALUES (p_user_id, p_lane_name, 'approaching_limit', 80, v_quota.used_usd, v_quota.limit_usd, v_quota.limit_usd - v_quota.used_usd, v_new_usage_pct, v_quota.period_start, v_quota.period_end, p_correlation_id);
    END IF;
    
    -- 90% alert
    IF v_new_usage_pct >= 90 AND NOT v_quota.alert_90_triggered THEN
      UPDATE lane_quotas
      SET alert_90_triggered = true, alert_90_triggered_at = NOW()
      WHERE id = v_quota.id;
      
      INSERT INTO quota_alerts (user_id, lane_name, alert_type, threshold_percentage, current_usage_usd, limit_usd, remaining_usd, usage_percentage, period_start, period_end, correlation_id)
      VALUES (p_user_id, p_lane_name, 'approaching_limit', 90, v_quota.used_usd, v_quota.limit_usd, v_quota.limit_usd - v_quota.used_usd, v_new_usage_pct, v_quota.period_start, v_quota.period_end, p_correlation_id);
    END IF;
    
    -- 100% alert (limit reached)
    IF v_new_usage_pct >= 100 AND NOT v_quota.alert_100_triggered THEN
      UPDATE lane_quotas
      SET alert_100_triggered = true, alert_100_triggered_at = NOW()
      WHERE id = v_quota.id;
      
      INSERT INTO quota_alerts (user_id, lane_name, alert_type, threshold_percentage, current_usage_usd, limit_usd, remaining_usd, usage_percentage, period_start, period_end, correlation_id, requests_blocked)
      VALUES (p_user_id, p_lane_name, 'limit_reached', 100, v_quota.used_usd, v_quota.limit_usd, v_quota.limit_usd - v_quota.used_usd, v_new_usage_pct, v_quota.period_start, v_quota.period_end, p_correlation_id, v_quota.auto_block_at_limit);
    END IF;
  END IF;
  
  RETURN v_allocation_id;
END;
$$;

-- Function to get cost summary by lane
CREATE OR REPLACE FUNCTION get_lane_cost_summary(
  p_user_id UUID,
  p_period_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  p_period_end TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  lane_name TEXT,
  total_cost_usd DECIMAL,
  total_requests BIGINT,
  avg_cost_per_request DECIMAL,
  top_provider TEXT,
  top_feature TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.lane_name,
    SUM(ca.cost_usd) as total_cost_usd,
    COUNT(*) as total_requests,
    ROUND(AVG(ca.cost_usd), 6) as avg_cost_per_request,
    MODE() WITHIN GROUP (ORDER BY ca.provider_name) as top_provider,
    MODE() WITHIN GROUP (ORDER BY ca.feature_name) as top_feature
  FROM cost_allocation ca
  WHERE ca.user_id = p_user_id
    AND ca.created_at >= p_period_start
    AND ca.created_at <= p_period_end
  GROUP BY ca.lane_name
  ORDER BY total_cost_usd DESC;
END;
$$;