/*
  # Create Memory System Tables

  1. New Tables
    - `memory_spaces`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text) - name of the memory space
      - `description` (text) - optional description
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `memories`
      - `id` (uuid, primary key)
      - `space_id` (uuid, foreign key to memory_spaces)
      - `user_id` (uuid, foreign key to auth.users)
      - `content` (text) - the actual memory content
      - `kind` (text) - type: 'fact', 'preference', 'task', 'context'
      - `embedding` (vector(1536)) - pgvector embedding for semantic search
      - `metadata` (jsonb) - flexible metadata storage
      - `source_conversation_id` (uuid, nullable) - link to ai_conversations
      - `source_message_id` (bigint, nullable) - link to ai_messages (bigint type)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only access their own memory spaces
    - Users can only access memories in their own spaces
  
  3. Indexes
    - Vector similarity search index on memories.embedding
    - Index on space_id and kind for filtering
    - Index on user_id for performance
*/

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memory_spaces table
CREATE TABLE IF NOT EXISTS memory_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create memories table
CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES memory_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fact', 'preference', 'task', 'context')),
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  source_conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  source_message_id bigint REFERENCES ai_messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE memory_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memory_spaces
CREATE POLICY "Users can view own memory spaces"
  ON memory_spaces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own memory spaces"
  ON memory_spaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory spaces"
  ON memory_spaces FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memory spaces"
  ON memory_spaces FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for memories
CREATE POLICY "Users can view own memories"
  ON memories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own memories"
  ON memories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON memories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON memories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_spaces_user_id ON memory_spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_space_id ON memories(space_id);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memories_source_conversation ON memories(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- Create function to automatically create default memory space for new users
CREATE OR REPLACE FUNCTION create_default_memory_space()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO memory_spaces (user_id, name, description)
  VALUES (NEW.id, 'Default', 'Your default memory space');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default space on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_memory_space ON auth.users;
CREATE TRIGGER on_auth_user_created_memory_space
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_memory_space();