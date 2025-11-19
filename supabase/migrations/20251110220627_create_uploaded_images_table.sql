/*
  # Create uploaded_images table for AI chat image attachments

  1. New Tables
    - `uploaded_images`
      - `id` (uuid, primary key) - Unique identifier for each image
      - `user_id` (uuid, foreign key) - References auth.users
      - `session_id` (text) - Session identifier for grouping
      - `conversation_id` (text, nullable) - Links to ai_conversations
      - `message_id` (bigint, nullable) - Links to ai_messages when attached to message
      - `storage_path` (text, unique) - Path in Supabase Storage
      - `public_url` (text) - Public URL for image access
      - `original_filename` (text) - Original filename from user
      - `file_size` (bigint) - Size in bytes
      - `mime_type` (text) - MIME type (image/jpeg, image/png, etc)
      - `width` (integer, nullable) - Image width in pixels
      - `height` (integer, nullable) - Image height in pixels
      - `thumbnail_url` (text, nullable) - URL for thumbnail version
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `uploaded_images` table
    - Add policy for users to read their own images
    - Add policy for users to insert their own images
    - Add policy for users to delete their own images
    - Add policy for users to update their own images

  3. Indexes
    - Index on user_id for fast user lookups
    - Index on session_id for fast session queries
    - Index on conversation_id for fast conversation queries
    - Index on message_id for fast message queries
    - Index on created_at for chronological ordering

  4. Updates
    - Add image_attachments column to ai_messages table
*/

CREATE TABLE IF NOT EXISTS uploaded_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  conversation_id text,
  message_id bigint,
  storage_path text UNIQUE NOT NULL,
  public_url text NOT NULL,
  original_filename text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  width integer,
  height integer,
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE uploaded_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own images"
  ON uploaded_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images"
  ON uploaded_images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own images"
  ON uploaded_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own images"
  ON uploaded_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_user_id
  ON uploaded_images(user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_session_id
  ON uploaded_images(session_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_conversation_id
  ON uploaded_images(conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_images_message_id
  ON uploaded_images(message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_images_created_at
  ON uploaded_images(created_at DESC);

CREATE OR REPLACE FUNCTION update_uploaded_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_uploaded_images_updated_at
  BEFORE UPDATE ON uploaded_images
  FOR EACH ROW
  EXECUTE FUNCTION update_uploaded_images_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_messages' AND column_name = 'image_attachments'
  ) THEN
    ALTER TABLE ai_messages
    ADD COLUMN image_attachments jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_messages_image_attachments
  ON ai_messages USING gin(image_attachments)
  WHERE image_attachments != '[]'::jsonb;
