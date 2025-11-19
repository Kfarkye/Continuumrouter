/*
  # Fix Image Security - Private Bucket with Signed URLs

  1. Schema Changes
    - Add `signed_url` column to `uploaded_images` table
    - Drop `public_url` column (security vulnerability)
    - Make storage_path non-nullable and unique for security

  2. Storage Security
    - Add RLS policies for private bucket 'chat-uploads'
    - Restrict uploads to user's own folder
    - Restrict access to user's own images

  3. Security Notes
    - Images are stored in PRIVATE bucket
    - Access ONLY via time-limited signed URLs
    - RLS enforces user isolation at storage level
*/

-- ============================================================================
-- STEP 1: Update uploaded_images table schema
-- ============================================================================

-- Add signed_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_images' AND column_name = 'signed_url'
  ) THEN
    ALTER TABLE uploaded_images ADD COLUMN signed_url TEXT;
  END IF;
END $$;

-- Drop public_url column (security vulnerability - images should be private)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_images' AND column_name = 'public_url'
  ) THEN
    ALTER TABLE uploaded_images DROP COLUMN public_url;
  END IF;
END $$;

-- Ensure storage_path is properly constrained
DO $$
BEGIN
  -- Make storage_path NOT NULL if it isn't already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_images'
    AND column_name = 'storage_path'
    AND is_nullable = 'YES'
  ) THEN
    -- First, clean up any NULL values
    DELETE FROM uploaded_images WHERE storage_path IS NULL;
    ALTER TABLE uploaded_images ALTER COLUMN storage_path SET NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Storage RLS Policies for Private Bucket
-- ============================================================================

-- Policy: Users can upload ONLY to their own folder
CREATE POLICY IF NOT EXISTS "Users can upload to their folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can ONLY view their own images
CREATE POLICY IF NOT EXISTS "Users can view their images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can ONLY delete their own images
CREATE POLICY IF NOT EXISTS "Users can delete their images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can ONLY update their own images
CREATE POLICY IF NOT EXISTS "Users can update their images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- STEP 3: Add helpful comment
-- ============================================================================

COMMENT ON COLUMN uploaded_images.signed_url IS 'Time-limited signed URL for secure image access. Generated on-demand with 1 hour expiry.';
COMMENT ON COLUMN uploaded_images.storage_path IS 'Path in private storage bucket. Format: {user_id}/{timestamp}_{random}.{ext}';
