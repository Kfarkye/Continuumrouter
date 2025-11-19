/*
  # Make embedding column nullable in memories table

  1. Changes
    - Alter `memories.embedding` column to allow NULL values
    
  2. Reason
    - CSV import does not include embeddings
    - Embeddings can be generated later via background process
    - Prevents 23502 NOT NULL constraint violations during import
*/

ALTER TABLE memories ALTER COLUMN embedding DROP NOT NULL;
