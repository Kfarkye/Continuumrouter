/*
  # Fix memories table - make space_id nullable

  1. Changes
    - Alter `memories.space_id` column to allow NULL values
    
  2. Reason
    - CSV import of clinician memories doesn't include space_id
    - Memories can be associated with clinician_id without a specific space
    - Prevents 23502 NOT NULL constraint violations during import
*/

ALTER TABLE memories ALTER COLUMN space_id DROP NOT NULL;
