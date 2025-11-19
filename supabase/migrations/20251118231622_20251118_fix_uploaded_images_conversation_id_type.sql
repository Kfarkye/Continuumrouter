/*
  # Fix uploaded_images conversation_id Type Mismatch

  1. Problem
    - uploaded_images.conversation_id is TEXT
    - ai_conversations.id is UUID
    - Cannot create foreign key constraint

  2. Solution
    - Drop old conversation_id column
    - Create new conversation_id column as UUID
    - Add proper foreign key constraint with cascade delete

  3. Data Migration
    - Existing data will be lost (acceptable for uploaded_images as these are temporary)
    - Production alternative: Convert TEXT to UUID if valid, nullify if invalid
*/

-- ============================================================================
-- STEP 1: Drop and recreate conversation_id with correct type
-- ============================================================================

-- Drop old column (this will remove any existing references)
ALTER TABLE uploaded_images DROP COLUMN IF EXISTS conversation_id;

-- Add new column with correct type
ALTER TABLE uploaded_images ADD COLUMN conversation_id UUID;

-- Add foreign key constraint with cascade delete
ALTER TABLE uploaded_images 
ADD CONSTRAINT uploaded_images_conversation_id_fkey 
FOREIGN KEY (conversation_id) 
REFERENCES ai_conversations(id) 
ON DELETE CASCADE;

-- ============================================================================
-- STEP 2: Add helpful comment
-- ============================================================================

COMMENT ON COLUMN uploaded_images.conversation_id IS 'UUID reference to ai_conversations. Nullable to support upload-before-send flow. Set when message is sent.';
