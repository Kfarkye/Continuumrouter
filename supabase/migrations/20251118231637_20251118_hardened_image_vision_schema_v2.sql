/*
  # Hardened Image Vision System Schema

  1. Schema Updates
    - Add file_size column for analytics and monitoring
    - Create indexes for performance optimization

  2. Orphan Cleanup System
    - Function to identify and clean images without conversation_id > 24h old
    - Automated cron job setup (requires pg_cron extension)
    - Logging for monitoring cleanup operations

  3. Security Enhancements
    - RLS policies for user isolation
    - Service role policies for Edge Function access

  4. Performance Optimizations
    - Indexes on user_id, conversation_id, created_at
    - Efficient lookup for image processing in Edge Function
*/

-- ============================================================================
-- STEP 1: Add file_size column
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_images' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE uploaded_images ADD COLUMN file_size INTEGER;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_uploaded_images_user 
  ON uploaded_images(user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_images_conversation 
  ON uploaded_images(conversation_id) 
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_images_created 
  ON uploaded_images(created_at);

-- Composite index for orphan cleanup query
CREATE INDEX IF NOT EXISTS idx_uploaded_images_orphan_lookup 
  ON uploaded_images(conversation_id, created_at) 
  WHERE conversation_id IS NULL;

-- ============================================================================
-- STEP 3: Orphan Cleanup System
-- ============================================================================

-- Function to clean up orphaned images (no conversation_id after 24h)
CREATE OR REPLACE FUNCTION cleanup_orphaned_images()
RETURNS TABLE(deleted_count INTEGER, storage_paths TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_storage_paths TEXT[] := '{}';
  r RECORD;
BEGIN
  -- Find and delete orphaned images
  FOR r IN 
    SELECT id, storage_path, file_name
    FROM uploaded_images
    WHERE conversation_id IS NULL 
    AND created_at < NOW() - INTERVAL '24 hours'
  LOOP
    v_storage_paths := array_append(v_storage_paths, r.storage_path);
    DELETE FROM uploaded_images WHERE id = r.id;
    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_deleted_count, v_storage_paths;
END;
$$;

-- Create cleanup log table for monitoring
CREATE TABLE IF NOT EXISTS uploaded_images_cleanup_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deleted_count INTEGER NOT NULL,
  storage_paths TEXT[],
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on cleanup log
ALTER TABLE uploaded_images_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Only service role can read cleanup logs
CREATE POLICY "Service role can view cleanup logs"
  ON uploaded_images_cleanup_log
  FOR SELECT
  TO service_role
  USING (TRUE);

-- ============================================================================
-- STEP 4: RLS Policies (Security Hardening)
-- ============================================================================

-- Ensure RLS is enabled
ALTER TABLE uploaded_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them safely
DROP POLICY IF EXISTS "Users can upload their own images" ON uploaded_images;
DROP POLICY IF EXISTS "Users can view their own images" ON uploaded_images;
DROP POLICY IF EXISTS "Users can delete their own images" ON uploaded_images;
DROP POLICY IF EXISTS "Users can update their own images" ON uploaded_images;
DROP POLICY IF EXISTS "Service role can access all images" ON uploaded_images;

-- Users can insert their own images
CREATE POLICY "Users can upload their own images"
  ON uploaded_images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own images
CREATE POLICY "Users can view their own images"
  ON uploaded_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own images
CREATE POLICY "Users can delete their own images"
  ON uploaded_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own images (e.g., linking to conversation)
CREATE POLICY "Users can update their own images"
  ON uploaded_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can access all images (for Edge Function processing)
CREATE POLICY "Service role can access all images"
  ON uploaded_images
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================================
-- STEP 5: Helpful Comments
-- ============================================================================

COMMENT ON COLUMN uploaded_images.file_size IS 'Compressed file size in bytes for monitoring and analytics';
COMMENT ON FUNCTION cleanup_orphaned_images() IS 'Cleans up images older than 24h without conversation_id. Returns deleted count and paths for storage cleanup.';

-- ============================================================================
-- STEP 6: Cron Job Setup Instructions
-- ============================================================================

-- Note: To enable automated cleanup, run this in Supabase SQL Editor:
-- 
-- SELECT cron.schedule(
--   'cleanup-orphaned-images',
--   '0 3 * * *',
--   $$
--   INSERT INTO uploaded_images_cleanup_log (deleted_count, storage_paths)
--   SELECT * FROM cleanup_orphaned_images();
--   $$
-- );
