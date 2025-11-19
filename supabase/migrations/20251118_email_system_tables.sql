/*
  # Email System for Continuum Recruiter Brain

  1. New Tables
    - `email_drafts`
      - Stores draft emails linked to clinicians
      - Auto-save functionality for recruiters
      - RLS: Users can only access their own drafts

    - `email_sent_log`
      - Tracks all sent emails with outcomes
      - Links to clinicians and assignments
      - RLS: Users can only view their own sent emails

    - `email_templates`
      - Custom user-created templates
      - Extends built-in templates from code
      - RLS: Users can only manage their own templates

    - `template_performance`
      - Analytics for template effectiveness
      - Response rates and conversion metrics
      - RLS: Users can view their own template stats

  2. Security
    - Enable RLS on all tables
    - Policies restrict access to user's own data
    - Clinician-linked data also restricted by user_id

  3. Extensions
    - Add email tracking columns to assignments table
    - Add template preferences to clinician_profiles
*/

-- Email Drafts Table
CREATE TABLE IF NOT EXISTS email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinician_id uuid REFERENCES clinician_profiles(id) ON DELETE SET NULL,
  template_id text,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  recipient_email text NOT NULL,
  attachment_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own drafts"
  ON email_drafts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_drafts_user_id ON email_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_clinician_id ON email_drafts(clinician_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_updated_at ON email_drafts(updated_at DESC);

-- Email Sent Log Table
CREATE TABLE IF NOT EXISTS email_sent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  clinician_id uuid REFERENCES clinician_profiles(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL,
  template_id text,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz DEFAULT now() NOT NULL,
  outcome text DEFAULT 'pending' CHECK (outcome IN ('pending', 'responded', 'no_response', 'bounced')),
  response_received_at timestamptz,
  notes text
);

ALTER TABLE email_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sent emails"
  ON email_sent_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sent emails"
  ON email_sent_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sent emails"
  ON email_sent_log
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_sent_log_user_id ON email_sent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_clinician_id ON email_sent_log(clinician_id);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_assignment_id ON email_sent_log(assignment_id);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_sent_at ON email_sent_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_sent_log_outcome ON email_sent_log(outcome);

-- Custom Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'outreach' CHECK (category IN ('outreach', 'ops', 'response', 'assignment')),
  stage text NOT NULL DEFAULT 'prospect' CHECK (stage IN ('prospect', 'active')),
  description text,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON email_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_stage ON email_templates(stage);

-- Template Performance Tracking
CREATE TABLE IF NOT EXISTS template_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id text NOT NULL,
  total_sent integer DEFAULT 0 NOT NULL,
  total_responded integer DEFAULT 0 NOT NULL,
  total_response_time_hours numeric DEFAULT 0 NOT NULL,
  total_conversions integer DEFAULT 0 NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, template_id)
);

ALTER TABLE template_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own template performance"
  ON template_performance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own template performance"
  ON template_performance
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_template_performance_user_id ON template_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_template_performance_template_id ON template_performance(template_id);

-- Extend assignments table with email tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignments' AND column_name = 'last_email_sent_at'
  ) THEN
    ALTER TABLE assignments ADD COLUMN last_email_sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assignments' AND column_name = 'email_count'
  ) THEN
    ALTER TABLE assignments ADD COLUMN email_count integer DEFAULT 0;
  END IF;
END $$;

-- Extend clinician_profiles with preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clinician_profiles' AND column_name = 'preferred_template_ids'
  ) THEN
    ALTER TABLE clinician_profiles ADD COLUMN preferred_template_ids text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clinician_profiles' AND column_name = 'communication_preferences'
  ) THEN
    ALTER TABLE clinician_profiles ADD COLUMN communication_preferences jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Function to update template performance on email send
CREATE OR REPLACE FUNCTION update_template_performance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    INSERT INTO template_performance (user_id, template_id, total_sent, last_used_at)
    VALUES (NEW.user_id, NEW.template_id, 1, NEW.sent_at)
    ON CONFLICT (user_id, template_id)
    DO UPDATE SET
      total_sent = template_performance.total_sent + 1,
      last_used_at = NEW.sent_at,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_template_performance
  AFTER INSERT ON email_sent_log
  FOR EACH ROW
  EXECUTE FUNCTION update_template_performance();

-- Function to update template performance on response
CREATE OR REPLACE FUNCTION update_template_performance_on_response()
RETURNS TRIGGER AS $$
DECLARE
  response_time_hours numeric;
BEGIN
  IF NEW.outcome = 'responded' AND OLD.outcome != 'responded' AND NEW.template_id IS NOT NULL THEN
    response_time_hours := EXTRACT(EPOCH FROM (NEW.response_received_at - NEW.sent_at)) / 3600;

    UPDATE template_performance
    SET
      total_responded = total_responded + 1,
      total_response_time_hours = total_response_time_hours + response_time_hours,
      updated_at = now()
    WHERE user_id = NEW.user_id AND template_id = NEW.template_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_template_performance_on_response
  AFTER UPDATE ON email_sent_log
  FOR EACH ROW
  WHEN (NEW.outcome IS DISTINCT FROM OLD.outcome)
  EXECUTE FUNCTION update_template_performance_on_response();

-- Function to update assignment email tracking
CREATE OR REPLACE FUNCTION update_assignment_email_tracking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignment_id IS NOT NULL THEN
    UPDATE assignments
    SET
      last_email_sent_at = NEW.sent_at,
      email_count = email_count + 1
    WHERE id = NEW.assignment_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_assignment_email_tracking
  AFTER INSERT ON email_sent_log
  FOR EACH ROW
  WHEN (NEW.assignment_id IS NOT NULL)
  EXECUTE FUNCTION update_assignment_email_tracking();

-- Updated auto-update for email_drafts
CREATE OR REPLACE FUNCTION update_email_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_email_drafts_updated_at
  BEFORE UPDATE ON email_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_email_drafts_updated_at();
