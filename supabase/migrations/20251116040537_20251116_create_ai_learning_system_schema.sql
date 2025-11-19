/*
  # AI-Assisted Development Learning System Schema

  ## Overview
  This migration creates comprehensive database schema for transforming Tutorial Mode
  into a full AI-assisted development learning platform that teaches the 7 core skills:
  1. How to describe what they want clearly
  2. How to debug AI-generated code
  3. How to iterate on prompts
  4. Which patterns work in React
  5. How to integrate different systems
  6. How to read and modify existing code
  7. Enough fundamentals to guide the AI

  ## New Tables

  ### 1. tutorial_categories
  Organizes tutorials into skill-based categories
  - `id` (uuid, primary key)
  - `name` (text) - Category name (e.g., "Prompt Engineering", "React Patterns")
  - `description` (text) - Detailed explanation
  - `icon` (text) - Lucide icon name for UI
  - `sort_order` (integer) - Display order
  - `skill_mapping` (jsonb) - Maps to the 7 core skills

  ### 2. tutorial_templates (extends existing tutorials)
  New columns added to tutorials table:
  - `category_id` (uuid) - Foreign key to categories
  - `difficulty` (text) - beginner, intermediate, advanced
  - `estimated_duration_minutes` (integer) - Expected completion time
  - `prerequisites` (jsonb) - Array of required tutorial IDs
  - `skill_focus` (jsonb) - Which of the 7 skills this teaches
  - `tutorial_type` (text) - explanation, exercise, challenge, project
  - `exercise_data` (jsonb) - Interactive exercise configuration

  ### 3. user_skills
  Tracks proficiency in the 7 core competency areas
  - `id` (uuid, primary key)
  - `user_id` (uuid) - Foreign key to auth.users
  - `skill_name` (text) - One of 7 core skills
  - `proficiency_level` (integer) - 0-100 score
  - `tutorials_completed` (integer) - Count in this skill area
  - `last_practiced_at` (timestamptz)
  - `created_at`, `updated_at` (timestamptz)

  ### 4. tutorial_exercises
  Interactive coding challenges and debugging exercises
  - `id` (uuid, primary key)
  - `tutorial_id` (uuid) - Parent tutorial
  - `exercise_type` (text) - find_bug, fix_code, write_prompt, identify_pattern
  - `title` (text)
  - `instructions` (text) - Markdown instructions
  - `starter_code` (text) - Initial code state
  - `solution_code` (text) - Correct answer
  - `test_cases` (jsonb) - Validation tests
  - `hints` (jsonb) - Progressive hint system
  - `max_attempts` (integer)
  - `sort_order` (integer)

  ### 5. user_exercise_attempts
  Tracks user progress on exercises
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `exercise_id` (uuid)
  - `attempt_number` (integer)
  - `submitted_code` (text)
  - `is_correct` (boolean)
  - `hints_used` (integer)
  - `time_spent_seconds` (integer)
  - `feedback` (text) - AI-generated feedback
  - `created_at` (timestamptz)

  ### 6. prompt_templates
  Library of effective prompts for learning
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable) - NULL for system templates
  - `title` (text)
  - `template_text` (text)
  - `category` (text)
  - `use_case` (text)
  - `effectiveness_rating` (numeric) - Community rating
  - `times_used` (integer)
  - `is_public` (boolean)
  - `example_result` (text) - Sample output

  ### 7. achievement_badges
  Gamification elements for motivation
  - `id` (uuid, primary key)
  - `name` (text)
  - `description` (text)
  - `icon` (text)
  - `rarity` (text) - common, rare, epic, legendary
  - `unlock_criteria` (jsonb) - Requirements to earn
  - `badge_type` (text) - skill_mastery, streak, milestone, community

  ### 8. user_achievements
  Tracks which badges users have earned
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `badge_id` (uuid)
  - `earned_at` (timestamptz)
  - `progress_snapshot` (jsonb) - User stats when earned

  ### 9. learning_paths
  Structured curriculum for systematic skill building
  - `id` (uuid, primary key)
  - `name` (text)
  - `description` (text)
  - `target_skill` (text) - One of 7 core skills
  - `tutorial_sequence` (jsonb) - Ordered tutorial IDs
  - `estimated_hours` (integer)
  - `is_active` (boolean)

  ### 10. user_learning_progress
  Tracks position in learning paths
  - `id` (uuid, primary key)
  - `user_id` (uuid)
  - `learning_path_id` (uuid)
  - `current_tutorial_index` (integer)
  - `started_at` (timestamptz)
  - `last_activity_at` (timestamptz)
  - `completed_at` (timestamptz, nullable)

  ## Security
  - Row Level Security enabled on all tables
  - Users can only access their own data
  - System content (templates, badges) is readable by all authenticated users
  - Exercise solutions hidden until user completes them

  ## Indexes
  - Performance indexes on foreign keys and commonly queried fields
  - User achievement lookups
  - Tutorial discovery queries
*/

-- Create tutorial_categories table
CREATE TABLE IF NOT EXISTS tutorial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'BookOpen',
  sort_order integer NOT NULL DEFAULT 0,
  skill_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Alter existing tutorials table to add new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN category_id uuid REFERENCES tutorial_categories(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'difficulty'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN difficulty text DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'estimated_duration_minutes'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN estimated_duration_minutes integer DEFAULT 15;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'prerequisites'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN prerequisites jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'skill_focus'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN skill_focus jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'tutorial_type'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN tutorial_type text DEFAULT 'explanation' CHECK (tutorial_type IN ('explanation', 'exercise', 'challenge', 'project'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tutorials' AND column_name = 'exercise_data'
  ) THEN
    ALTER TABLE tutorials ADD COLUMN exercise_data jsonb DEFAULT NULL;
  END IF;
END $$;

-- Create user_skills table
CREATE TABLE IF NOT EXISTS user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name text NOT NULL CHECK (skill_name IN (
    'clear_communication',
    'debugging_ai_code',
    'prompt_iteration',
    'react_patterns',
    'system_integration',
    'code_reading',
    'ai_fundamentals'
  )),
  proficiency_level integer NOT NULL DEFAULT 0 CHECK (proficiency_level >= 0 AND proficiency_level <= 100),
  tutorials_completed integer NOT NULL DEFAULT 0,
  exercises_passed integer NOT NULL DEFAULT 0,
  last_practiced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, skill_name)
);

-- Create tutorial_exercises table
CREATE TABLE IF NOT EXISTS tutorial_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutorial_id uuid NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
  exercise_type text NOT NULL CHECK (exercise_type IN (
    'find_bug',
    'fix_code',
    'write_prompt',
    'identify_pattern',
    'refactor_code',
    'explain_code',
    'integrate_api'
  )),
  title text NOT NULL,
  instructions text NOT NULL,
  starter_code text,
  solution_code text NOT NULL,
  test_cases jsonb DEFAULT '[]'::jsonb,
  hints jsonb DEFAULT '[]'::jsonb,
  max_attempts integer DEFAULT 3,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create user_exercise_attempts table
CREATE TABLE IF NOT EXISTS user_exercise_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES tutorial_exercises(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  submitted_code text,
  submitted_prompt text,
  is_correct boolean NOT NULL DEFAULT false,
  hints_used integer NOT NULL DEFAULT 0,
  time_spent_seconds integer DEFAULT 0,
  feedback text,
  created_at timestamptz DEFAULT now()
);

-- Create prompt_templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  template_text text NOT NULL,
  category text NOT NULL,
  use_case text NOT NULL,
  effectiveness_rating numeric(3,2) DEFAULT 0.0 CHECK (effectiveness_rating >= 0 AND effectiveness_rating <= 5.0),
  times_used integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  example_result text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create achievement_badges table
CREATE TABLE IF NOT EXISTS achievement_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Award',
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  unlock_criteria jsonb NOT NULL,
  badge_type text NOT NULL CHECK (badge_type IN ('skill_mastery', 'streak', 'milestone', 'community')),
  created_at timestamptz DEFAULT now()
);

-- Create user_achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES achievement_badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  progress_snapshot jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, badge_id)
);

-- Create learning_paths table
CREATE TABLE IF NOT EXISTS learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  target_skill text NOT NULL,
  tutorial_sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_hours integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_learning_progress table
CREATE TABLE IF NOT EXISTS user_learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_path_id uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  current_tutorial_index integer NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(user_id, learning_path_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tutorials_category_id ON tutorials(category_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_difficulty ON tutorials(difficulty);
CREATE INDEX IF NOT EXISTS idx_tutorials_type ON tutorials(tutorial_type);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_name ON user_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_user_skills_proficiency ON user_skills(proficiency_level DESC);

CREATE INDEX IF NOT EXISTS idx_tutorial_exercises_tutorial_id ON tutorial_exercises(tutorial_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_exercises_type ON tutorial_exercises(exercise_type);

CREATE INDEX IF NOT EXISTS idx_user_exercise_attempts_user_id ON user_exercise_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_attempts_exercise_id ON user_exercise_attempts(exercise_id);
CREATE INDEX IF NOT EXISTS idx_user_exercise_attempts_correct ON user_exercise_attempts(is_correct);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_public ON prompt_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_prompt_templates_rating ON prompt_templates(effectiveness_rating DESC);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_badge_id ON user_achievements(badge_id);

CREATE INDEX IF NOT EXISTS idx_learning_paths_active ON learning_paths(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_learning_progress_user_id ON user_learning_progress(user_id);

-- Enable Row Level Security
ALTER TABLE tutorial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exercise_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievement_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tutorial_categories (public read)
CREATE POLICY "Anyone can view tutorial categories"
  ON tutorial_categories FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_skills
CREATE POLICY "Users can view own skills"
  ON user_skills FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own skills"
  ON user_skills FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills"
  ON user_skills FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for tutorial_exercises (public read for learning)
CREATE POLICY "Users can view exercises"
  ON tutorial_exercises FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_exercise_attempts
CREATE POLICY "Users can view own attempts"
  ON user_exercise_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attempts"
  ON user_exercise_attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for prompt_templates
CREATE POLICY "Users can view public templates"
  ON prompt_templates FOR SELECT
  TO authenticated
  USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON prompt_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON prompt_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON prompt_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for achievement_badges (public read)
CREATE POLICY "Anyone can view badges"
  ON achievement_badges FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for user_achievements
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view others' achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for learning_paths (public read)
CREATE POLICY "Anyone can view active learning paths"
  ON learning_paths FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policies for user_learning_progress
CREATE POLICY "Users can view own progress"
  ON user_learning_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON user_learning_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON user_learning_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_skills_updated_at
  BEFORE UPDATE ON user_skills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_paths_updated_at
  BEFORE UPDATE ON learning_paths
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default tutorial categories
INSERT INTO tutorial_categories (name, description, icon, sort_order, skill_mapping) VALUES
  ('Prompt Engineering', 'Learn to communicate clearly with AI assistants and write effective prompts', 'MessageSquare', 1, '["clear_communication", "prompt_iteration"]'),
  ('Debugging AI Code', 'Identify and fix common issues in AI-generated code', 'Bug', 2, '["debugging_ai_code", "code_reading"]'),
  ('React Patterns', 'Master essential React patterns, hooks, and best practices', 'Boxes', 3, '["react_patterns", "ai_fundamentals"]'),
  ('System Integration', 'Connect APIs, databases, and frontend components effectively', 'Network', 4, '["system_integration", "ai_fundamentals"]'),
  ('Code Reading', 'Develop speed reading and comprehension skills for existing codebases', 'BookOpen', 5, '["code_reading", "ai_fundamentals"]'),
  ('AI Fundamentals', 'Understand core concepts needed to guide AI development effectively', 'Lightbulb', 6, '["ai_fundamentals", "clear_communication"]'),
  ('Full-Stack Projects', 'Build complete applications with AI assistance from start to finish', 'Rocket', 7, '["system_integration", "react_patterns", "debugging_ai_code"]')
ON CONFLICT (name) DO NOTHING;

-- Insert starter achievement badges
INSERT INTO achievement_badges (name, description, icon, rarity, unlock_criteria, badge_type) VALUES
  ('First Steps', 'Complete your first tutorial', 'Star', 'common', '{"tutorials_completed": 1}', 'milestone'),
  ('Bug Hunter', 'Successfully fix 10 debugging exercises', 'Bug', 'common', '{"debugging_exercises_passed": 10}', 'skill_mastery'),
  ('Prompt Master', 'Create 5 effective prompts rated 4+ stars', 'Zap', 'rare', '{"high_rated_prompts": 5}', 'skill_mastery'),
  ('React Guru', 'Complete all React pattern tutorials', 'Code', 'epic', '{"react_tutorials_completed": "all"}', 'skill_mastery'),
  ('Week Warrior', 'Practice 7 days in a row', 'Flame', 'rare', '{"streak_days": 7}', 'streak'),
  ('Integration Expert', 'Complete 3 full-stack integration projects', 'Network', 'epic', '{"integration_projects_completed": 3}', 'skill_mastery'),
  ('Speed Reader', 'Complete 5 code reading exercises in under 5 minutes each', 'Zap', 'rare', '{"fast_reading_completions": 5}', 'skill_mastery'),
  ('Legendary Learner', 'Achieve 80+ proficiency in all 7 core skills', 'Trophy', 'legendary', '{"all_skills_proficiency": 80}', 'skill_mastery')
ON CONFLICT (name) DO NOTHING;
