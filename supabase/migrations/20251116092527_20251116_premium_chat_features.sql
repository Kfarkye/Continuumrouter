/*
  # Premium Chat Features Schema
  
  Adds support for message ratings, artifacts panel, and citations.
*/

-- Add rating columns to ai_messages
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_messages' AND column_name = 'rating') THEN
    ALTER TABLE ai_messages ADD COLUMN rating text CHECK (rating IN ('good', 'bad'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_messages' AND column_name = 'rated_at') THEN
    ALTER TABLE ai_messages ADD COLUMN rated_at timestamptz;
  END IF;
END $$;

-- Create artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id bigint REFERENCES ai_messages(id) ON DELETE CASCADE,
  title text NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type IN ('html', 'mermaid', 'openapi', 'react', 'javascript')),
  content text NOT NULL,
  compiled_content text,
  display_mode text DEFAULT 'preview',
  is_fullscreen boolean DEFAULT false,
  version integer DEFAULT 1,
  parent_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own artifacts" ON artifacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own artifacts" ON artifacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own artifacts" ON artifacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own artifacts" ON artifacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create message_ratings table
CREATE TABLE IF NOT EXISTS message_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id bigint NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('good', 'bad')),
  model_used text,
  message_length integer,
  response_time_ms integer,
  feedback_text text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE message_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ratings" ON message_ratings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own ratings" ON message_ratings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ratings" ON message_ratings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own ratings" ON message_ratings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create artifact_versions table
CREATE TABLE IF NOT EXISTS artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  compiled_content text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(artifact_id, version_number)
);

ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view artifact versions" ON artifact_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM artifacts WHERE artifacts.id = artifact_versions.artifact_id AND artifacts.user_id = auth.uid()));
CREATE POLICY "Users create artifact versions" ON artifact_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM artifacts WHERE artifacts.id = artifact_versions.artifact_id AND artifacts.user_id = auth.uid()));
