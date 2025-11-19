/*
  # Remove restrictive kind check constraint from memories table

  1. Changes
    - Drop the CHECK constraint on memories.kind column
    
  2. Reason
    - Current constraint only allows: 'fact', 'preference', 'task', 'context'
    - Clinician import uses 'note' as a kind value
    - System needs flexibility for different memory types
    - Prevents 23514 CHECK constraint violations during import
*/

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_kind_check;
