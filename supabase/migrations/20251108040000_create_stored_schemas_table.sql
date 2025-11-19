/*
  # Create stored_schemas table for schema storage

  1. New Tables
    - `stored_schemas`
      - `id` (uuid, primary key) - Unique identifier for each schema
      - `session_id` (text) - Session/conversation identifier
      - `name` (text) - Schema name
      - `content` (jsonb) - Schema content (flexible JSON storage)
      - `created_at` (timestamptz) - Creation timestamp
      - `user_id` (uuid) - References auth.users (owner of the schema)

  2. Security
    - Enable RLS on `stored_schemas` table
    - Add policy for users to access only their own schemas
    - Add policy for authenticated users to insert their own schemas
    - Add policy for users to delete their own schemas

  3. Indexes
    - Index on session_id for faster queries
    - Index on user_id for RLS performance
    - Index on created_at for sorting
*/

-- Create stored_schemas table
CREATE TABLE IF NOT EXISTS stored_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stored_schemas_session_id ON stored_schemas(session_id);
CREATE INDEX IF NOT EXISTS idx_stored_schemas_user_id ON stored_schemas(user_id);
CREATE INDEX IF NOT EXISTS idx_stored_schemas_created_at ON stored_schemas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_schemas_name ON stored_schemas(name);

-- Enable Row Level Security
ALTER TABLE stored_schemas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own schemas
CREATE POLICY "Users can read own schemas"
  ON stored_schemas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own schemas
CREATE POLICY "Users can insert own schemas"
  ON stored_schemas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own schemas
CREATE POLICY "Users can update own schemas"
  ON stored_schemas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own schemas
CREATE POLICY "Users can delete own schemas"
  ON stored_schemas
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
