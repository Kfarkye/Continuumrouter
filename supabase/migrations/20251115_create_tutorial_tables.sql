/*
  # Create Tutorial System Tables

  ## Overview
  This migration creates the database schema for the Tutorial Mode feature,
  which provides step-by-step code explanations with dynamic line highlighting.

  ## Tables Created

  ### 1. tutorials
  - `id` (uuid, primary key) - Unique tutorial identifier
  - `user_id` (uuid, foreign key) - Owner of the tutorial
  - `project_id` (uuid, foreign key, nullable) - Associated project
  - `title` (text) - Tutorial title or auto-generated name
  - `code` (text) - The code being explained
  - `language` (text) - Programming language of the code
  - `status` (text) - Tutorial status: 'draft', 'processing', 'ready', 'error'
  - `completion_percentage` (integer) - User progress through tutorial (0-100)
  - `total_steps` (integer) - Total number of teaching steps
  - `error_message` (text, nullable) - Error details if processing failed
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last modification timestamp
  - `last_accessed_at` (timestamptz) - When user last viewed this tutorial

  ### 2. tutorial_steps
  - `id` (uuid, primary key) - Unique step identifier
  - `tutorial_id` (uuid, foreign key) - Parent tutorial
  - `step_number` (integer) - Sequential step order (1, 2, 3, ...)
  - `explanation` (text) - Markdown-formatted teaching content
  - `highlight_spec` (text, nullable) - Line numbers to highlight (e.g., "1-5,10,15-20")
  - `is_completed` (boolean) - Whether user has viewed this step
  - `created_at` (timestamptz) - Creation timestamp

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access their own tutorials
  - All operations require authentication

  ## Indexes
  - tutorials: user_id, project_id, status, created_at
  - tutorial_steps: tutorial_id, step_number
*/

-- Create tutorials table
CREATE TABLE IF NOT EXISTS tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  code text NOT NULL,
  language text NOT NULL DEFAULT 'plaintext',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready', 'error')),
  completion_percentage integer NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  total_steps integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now()
);

-- Create tutorial_steps table
CREATE TABLE IF NOT EXISTS tutorial_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutorial_id uuid NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number > 0),
  explanation text NOT NULL,
  highlight_spec text,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tutorial_id, step_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tutorials_user_id ON tutorials(user_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_project_id ON tutorials(project_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_status ON tutorials(status);
CREATE INDEX IF NOT EXISTS idx_tutorials_created_at ON tutorials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutorials_last_accessed ON tutorials(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutorial_steps_tutorial_id ON tutorial_steps(tutorial_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_steps_step_number ON tutorial_steps(tutorial_id, step_number);

-- Enable Row Level Security
ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tutorials table
CREATE POLICY "Users can view own tutorials"
  ON tutorials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tutorials"
  ON tutorials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tutorials"
  ON tutorials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tutorials"
  ON tutorials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for tutorial_steps table
CREATE POLICY "Users can view steps of own tutorials"
  ON tutorial_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tutorials
      WHERE tutorials.id = tutorial_steps.tutorial_id
      AND tutorials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert steps for own tutorials"
  ON tutorial_steps FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tutorials
      WHERE tutorials.id = tutorial_steps.tutorial_id
      AND tutorials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update steps of own tutorials"
  ON tutorial_steps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tutorials
      WHERE tutorials.id = tutorial_steps.tutorial_id
      AND tutorials.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tutorials
      WHERE tutorials.id = tutorial_steps.tutorial_id
      AND tutorials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete steps of own tutorials"
  ON tutorial_steps FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tutorials
      WHERE tutorials.id = tutorial_steps.tutorial_id
      AND tutorials.user_id = auth.uid()
    )
  );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tutorial_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on tutorials
CREATE TRIGGER update_tutorials_updated_at
  BEFORE UPDATE ON tutorials
  FOR EACH ROW
  EXECUTE FUNCTION update_tutorial_updated_at();
