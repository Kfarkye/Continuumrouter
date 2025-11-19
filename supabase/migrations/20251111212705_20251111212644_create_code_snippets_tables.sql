/*
  # Create Code Snippets Tables

  ## Overview
  Tables for storing and organizing extracted code snippets from chat conversations,
  with bookmarking functionality for user-saved favorites.

  ## New Tables

  ### 1. code_snippets
  Stores individual code blocks extracted from chat messages
  - `id` (uuid, primary key) - Unique snippet identifier
  - `message_id` (text) - Reference to the chat message containing this snippet
  - `conversation_id` (uuid, FK) - Links to ai_conversations table
  - `user_id` (uuid, FK) - User who owns this snippet
  - `language` (text) - Programming language detected from code block
  - `content` (text) - Actual code content
  - `line_count` (int) - Number of lines in the snippet
  - `order_index` (int) - Position of this snippet within the message (for multiple code blocks)
  - `user_defined_name` (text) - Optional custom name set by user
  - `created_at` (timestamptz) - When snippet was extracted
  - `updated_at` (timestamptz) - Last modification time

  ### 2. snippet_bookmarks
  User bookmarks and organization for code snippets
  - `id` (uuid, primary key) - Unique bookmark identifier
  - `snippet_id` (uuid, FK) - References code_snippets table
  - `user_id` (uuid, FK) - User who created the bookmark
  - `folder_path` (text) - Virtual folder path for organization (e.g., "React/Hooks")
  - `notes` (text) - User notes about the snippet
  - `created_at` (timestamptz) - When bookmark was created

  ## Security
  - RLS enabled on both tables
  - Users can only access their own snippets and bookmarks
  - Automatic extraction is handled by authenticated users

  ## Performance
  - Indexes on conversation_id for fast conversation-level queries
  - Index on message_id for quick message-to-snippets lookup
  - Composite index on user_id + created_at for efficient user queries
*/

-- Create code_snippets table
CREATE TABLE IF NOT EXISTS code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  language text DEFAULT 'plaintext',
  content text NOT NULL,
  line_count int DEFAULT 0,
  order_index int DEFAULT 0,
  user_defined_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create snippet_bookmarks table
CREATE TABLE IF NOT EXISTS snippet_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snippet_id uuid REFERENCES code_snippets(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  folder_path text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_code_snippets_conversation ON code_snippets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_code_snippets_message ON code_snippets(message_id);
CREATE INDEX IF NOT EXISTS idx_code_snippets_user_date ON code_snippets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_snippets_language ON code_snippets(language);
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_snippet ON snippet_bookmarks(snippet_id);
CREATE INDEX IF NOT EXISTS idx_snippet_bookmarks_user ON snippet_bookmarks(user_id);

-- Enable RLS
ALTER TABLE code_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippet_bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for code_snippets
CREATE POLICY "Users can view own code snippets"
  ON code_snippets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own code snippets"
  ON code_snippets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own code snippets"
  ON code_snippets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own code snippets"
  ON code_snippets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for snippet_bookmarks
CREATE POLICY "Users can view own bookmarks"
  ON snippet_bookmarks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bookmarks"
  ON snippet_bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookmarks"
  ON snippet_bookmarks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON snippet_bookmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE code_snippets IS 'Extracted code blocks from chat messages with metadata';
COMMENT ON TABLE snippet_bookmarks IS 'User bookmarks and organization for saved code snippets';
