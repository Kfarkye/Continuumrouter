/*
  # Enhance stored_schemas table with rich metadata support

  1. Schema Changes
    - Add `format` column to track schema type (typescript, json_schema, zod, sql_ddl, prisma, openapi)
    - Add `description` column for human-readable schema purpose
    - Add `source_file` column to track original file source
    - Add `metadata` JSONB column for flexible additional data
    - Add `tags` array column for searchability

  2. Indexes
    - Create GIN index on metadata for fast JSON queries
    - Create GIN index on tags for efficient tag-based searches
    - Add index on format for filtering by schema type

  3. Benefits
    - Richer schema documentation and context
    - Better searchability and discoverability
    - Support for multiple schema formats
    - Flexible metadata storage for future enhancements
*/

-- Add new columns to stored_schemas table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stored_schemas' AND column_name = 'format'
  ) THEN
    ALTER TABLE stored_schemas ADD COLUMN format TEXT DEFAULT 'json_schema';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stored_schemas' AND column_name = 'description'
  ) THEN
    ALTER TABLE stored_schemas ADD COLUMN description TEXT DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stored_schemas' AND column_name = 'source_file'
  ) THEN
    ALTER TABLE stored_schemas ADD COLUMN source_file TEXT DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stored_schemas' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE stored_schemas ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stored_schemas' AND column_name = 'tags'
  ) THEN
    ALTER TABLE stored_schemas ADD COLUMN tags TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stored_schemas_format ON stored_schemas(format);
CREATE INDEX IF NOT EXISTS idx_stored_schemas_metadata ON stored_schemas USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_stored_schemas_tags ON stored_schemas USING GIN(tags);

-- Add helpful comment
COMMENT ON COLUMN stored_schemas.format IS 'Schema format type: typescript, json_schema, zod, sql_ddl, prisma, openapi';
COMMENT ON COLUMN stored_schemas.description IS 'Human-readable description of the schema purpose';
COMMENT ON COLUMN stored_schemas.source_file IS 'Original file or source where the schema was extracted from';
COMMENT ON COLUMN stored_schemas.metadata IS 'Flexible JSONB field for additional schema metadata';
COMMENT ON COLUMN stored_schemas.tags IS 'Array of tags for categorization and search';
