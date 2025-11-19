/*
  # Clinician Reply Assistant System

  1. New Tables
    - `clinician_communication_profiles`
      - Extends clinician_profiles with communication preferences
      - Stores style, notes, last contact date
    - `reply_threads`
      - Groups related messages into conversation threads
      - Links to projects for context
    - `reply_messages`
      - Individual messages within threads
      - Stores incoming text, AI-generated replies, user selections
    - `clinician_interactions`
      - Historical log of all interactions with clinicians
      - Tracks types: text_reply, phone_call, email, etc.

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data
    - Separate policies for SELECT, INSERT, UPDATE, DELETE

  3. Performance
    - Indexes on all foreign keys
    - Composite indexes for common queries
    - Optimized for thread listing and message retrieval

  4. Integration
    - Links with existing clinician_profiles
    - Integrates with projects (spaces)
    - Works with memories table for context
*/

-- ============================================================================
-- 1. Communication Profiles (extends existing clinician_profiles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinician_communication_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  communication_style TEXT NOT NULL DEFAULT 'professional_formal'
    CHECK (communication_style IN (
      'warm_friendly',
      'direct_brief',
      'professional_formal',
      'casual_relaxed'
    )),
  notes TEXT,
  last_contacted TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_comm_profile_clinician UNIQUE (clinician_id)
);

-- ============================================================================
-- 2. Reply Threads (weekly conversation groupings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reply_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. Reply Messages (individual messages in threads)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reply_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES reply_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('user_input', 'ai_response', 'system')),
  incoming_text TEXT,
  user_goal TEXT,
  generated_reply_1 TEXT,
  generated_reply_2 TEXT,
  selected_reply TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. Clinician Interactions (history tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinician_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (
    interaction_type IN ('text_reply', 'phone_call', 'email', 'extension_request', 'issue_resolution', 'other')
  ),
  interaction_summary TEXT,
  interaction_date TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_comm_profile_clinician ON clinician_communication_profiles(clinician_id);
CREATE INDEX IF NOT EXISTS idx_comm_profile_user ON clinician_communication_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON reply_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_project ON reply_threads(project_id);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON reply_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_clinician ON reply_messages(clinician_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_clinician_date ON clinician_interactions(clinician_id, interaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON clinician_interactions(user_id, interaction_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE clinician_communication_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_interactions ENABLE ROW LEVEL SECURITY;

-- Communication Profiles Policies
CREATE POLICY "Users view own comm profiles"
  ON clinician_communication_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own comm profiles"
  ON clinician_communication_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own comm profiles"
  ON clinician_communication_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own comm profiles"
  ON clinician_communication_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reply Threads Policies
CREATE POLICY "Users view own threads"
  ON reply_threads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own threads"
  ON reply_threads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own threads"
  ON reply_threads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own threads"
  ON reply_threads FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Reply Messages Policies
CREATE POLICY "Users view own messages"
  ON reply_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own messages"
  ON reply_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own messages"
  ON reply_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Interactions Policies
CREATE POLICY "Users view own interactions"
  ON clinician_interactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own interactions"
  ON clinician_interactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTION (integrates with existing recruiter_dashboard)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_clinician_reply_context(
  p_clinician_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  full_name TEXT,
  email TEXT,
  phone TEXT,
  communication_style TEXT,
  profile_notes TEXT,
  assignment_facility TEXT,
  assignment_end_date DATE,
  days_remaining INT,
  recent_interactions JSONB,
  golden_notes JSONB
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.full_name,
    cp.email,
    cp.phone,
    COALESCE(ccp.communication_style, 'professional_formal'),
    ccp.notes,
    a.facility_name,
    a.end_date,
    (a.end_date - CURRENT_DATE)::INT as days_remaining,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', ci.interaction_type,
          'summary', ci.interaction_summary,
          'date', ci.interaction_date
        ) ORDER BY ci.interaction_date DESC
      )
      FROM clinician_interactions ci
      WHERE ci.clinician_id = p_clinician_id
        AND ci.user_id = p_user_id
      LIMIT 5
    ) as recent_interactions,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'content', m.content,
          'created_at', m.created_at
        ) ORDER BY m.created_at DESC
      )
      FROM memories m
      WHERE m.clinician_id = p_clinician_id
        AND m.user_id = p_user_id
      LIMIT 10
    ) as golden_notes
  FROM clinician_profiles cp
  LEFT JOIN clinician_communication_profiles ccp ON cp.id = ccp.clinician_id
  LEFT JOIN LATERAL (
    SELECT facility_name, end_date
    FROM assignments
    WHERE clinician_id = p_clinician_id
      AND status = 'active'
      AND end_date >= CURRENT_DATE
    ORDER BY end_date ASC
    LIMIT 1
  ) a ON true
  WHERE cp.id = p_clinician_id
    AND cp.user_id = p_user_id;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_last_contacted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_type = 'ai_response' AND NEW.selected_reply IS NOT NULL THEN
    UPDATE clinician_communication_profiles
    SET last_contacted = NEW.created_at,
        updated_at = NEW.created_at
    WHERE clinician_id = NEW.clinician_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_last_contacted
  AFTER INSERT OR UPDATE ON reply_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_last_contacted();