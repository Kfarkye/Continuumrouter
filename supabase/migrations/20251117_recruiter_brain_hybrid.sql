/*
  # Aya Healthcare Recruiter Brain - Hybrid Architecture

  1. New Tables
    - `clinician_profiles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `full_name` (text) - clinician's full name
      - `email` (text) - contact email
      - `phone` (text) - contact phone
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (user_id, email) for idempotent imports

    - `assignments`
      - `id` (uuid, primary key)
      - `clinician_id` (uuid, foreign key to clinician_profiles)
      - `user_id` (uuid, foreign key to auth.users)
      - `facility_name` (text) - where they're working
      - `start_date` (date) - assignment start
      - `end_date` (date) - assignment end
      - `status` (text) - active or completed
      - `created_at` (timestamptz)

  2. Changes to Existing Tables
    - Add `clinician_id` to `projects` table (the key bridge)
    - Add `system_prompt` to `projects` table
    - Add unique index ensuring one space per clinician per user
    - Add `clinician_id` to `memories` table (golden notes)
    - Add `clinician_id` to `ai_conversations` table

  3. Dashboard View
    - `recruiter_dashboard` view with priority logic
    - Calculates days_remaining and trigger_type
    - Filters for active assignments ending in future

  4. Security
    - Enable RLS on clinician_profiles and assignments
    - Users can only access their own clinician data
    - RLS policies for all CRUD operations

  5. Indexes
    - Performance indexes on email, assignments, and dashboard queries
*/

-- ============================================================================
-- 1. Clinician Profiles Table (Structured Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_clinician_user_email UNIQUE (user_id, email)
);

-- Enable RLS
ALTER TABLE clinician_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own clinicians"
  ON clinician_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_clinician_email ON clinician_profiles(user_id, email);
CREATE INDEX IF NOT EXISTS idx_clinician_user_id ON clinician_profiles(user_id);

-- ============================================================================
-- 2. Assignments Table (Structured Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinician_id UUID NOT NULL REFERENCES clinician_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own assignments"
  ON assignments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_clinician_end ON assignments(clinician_id, end_date DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active_dashboard ON assignments(user_id, status, end_date) WHERE status = 'active';

-- ============================================================================
-- 3. Link Projects to Clinicians (The Key Bridge)
-- ============================================================================

-- Add clinician_id column to projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'clinician_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add system_prompt column to projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'system_prompt'
  ) THEN
    ALTER TABLE projects ADD COLUMN system_prompt TEXT;
  END IF;
END $$;

-- Ensure one dedicated space per clinician per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_clinician
  ON projects(user_id, clinician_id)
  WHERE clinician_id IS NOT NULL;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_projects_clinician ON projects(clinician_id);

-- ============================================================================
-- 4. Link Memories to Clinicians (Golden Notes)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'clinician_id'
  ) THEN
    ALTER TABLE memories ADD COLUMN clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memories_clinician ON memories(clinician_id, created_at DESC);

-- ============================================================================
-- 5. Link Conversations to Clinicians
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'clinician_id'
  ) THEN
    ALTER TABLE ai_conversations ADD COLUMN clinician_id UUID REFERENCES clinician_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_clinician ON ai_conversations(clinician_id);

-- ============================================================================
-- 6. Dashboard View (Priority Logic)
-- ============================================================================

CREATE OR REPLACE VIEW recruiter_dashboard AS
SELECT
  p.id AS clinician_id,
  p.user_id,
  p.full_name,
  p.email,
  p.phone,
  a.facility_name,
  a.start_date,
  a.end_date,
  a.end_date - CURRENT_DATE AS days_remaining,
  CASE
    WHEN a.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '42 days'
    THEN 'extend_or_explore'
    WHEN a.end_date BETWEEN CURRENT_DATE + INTERVAL '43 days' AND CURRENT_DATE + INTERVAL '56 days'
    THEN 'check_in'
    ELSE 'no_action'
  END AS trigger_type,
  CASE
    WHEN a.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '42 days'
    THEN 1
    WHEN a.end_date BETWEEN CURRENT_DATE + INTERVAL '43 days' AND CURRENT_DATE + INTERVAL '56 days'
    THEN 2
    ELSE 3
  END AS priority_order
FROM clinician_profiles p
JOIN assignments a ON a.clinician_id = p.id
WHERE a.status = 'active'
  AND a.end_date >= CURRENT_DATE
ORDER BY priority_order ASC, a.end_date ASC;

-- ============================================================================
-- 7. Helper Function to Get Clinician Context
-- ============================================================================

CREATE OR REPLACE FUNCTION get_clinician_context(p_clinician_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_profile JSON;
  v_assignments JSON;
  v_memories JSON;
  v_result JSON;
BEGIN
  -- Verify user owns this clinician
  IF NOT EXISTS (
    SELECT 1 FROM clinician_profiles
    WHERE id = p_clinician_id AND user_id = p_user_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Get profile
  SELECT row_to_json(cp.*) INTO v_profile
  FROM clinician_profiles cp
  WHERE cp.id = p_clinician_id;

  -- Get active assignments
  SELECT json_agg(row_to_json(a.*)) INTO v_assignments
  FROM assignments a
  WHERE a.clinician_id = p_clinician_id
    AND a.status = 'active'
  ORDER BY a.end_date ASC;

  -- Get recent memories (golden notes)
  SELECT json_agg(row_to_json(m.*)) INTO v_memories
  FROM (
    SELECT content, created_at, kind
    FROM memories
    WHERE clinician_id = p_clinician_id
    ORDER BY created_at DESC
    LIMIT 10
  ) m;

  -- Combine into single JSON object
  v_result := json_build_object(
    'profile', v_profile,
    'assignments', COALESCE(v_assignments, '[]'::json),
    'memories', COALESCE(v_memories, '[]'::json)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
