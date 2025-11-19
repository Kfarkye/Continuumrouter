/*
  # Create Design Specs Table

  1. New Tables
    - `design_specs`
      - `id` (uuid, primary key) - Unique identifier for each design spec
      - `user_id` (uuid) - References auth.users, owner of the spec
      - `name` (text) - Name of the design spec (e.g., "Brand Colors", "Typography Scale")
      - `category` (text) - Category: 'colors', 'typography', 'spacing', 'components'
      - `spec_data` (jsonb) - The actual design specification data
      - `description` (text, nullable) - Optional description of the spec
      - `tags` (text[], nullable) - Optional tags for categorization
      - `is_favorite` (boolean) - Whether the spec is marked as favorite
      - `created_at` (timestamptz) - When the spec was created
      - `updated_at` (timestamptz) - When the spec was last updated

  2. Security
    - Enable RLS on `design_specs` table
    - Add policy for users to read their own specs
    - Add policy for users to insert their own specs
    - Add policy for users to update their own specs
    - Add policy for users to delete their own specs

  3. Indexes
    - Index on user_id for fast lookups
    - Index on category for filtering
    - Index on created_at for sorting
*/

-- Create the design_specs table
CREATE TABLE IF NOT EXISTS design_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('colors', 'typography', 'spacing', 'components', 'other')),
  spec_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  tags text[] DEFAULT '{}',
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_design_specs_user_id ON design_specs(user_id);
CREATE INDEX IF NOT EXISTS idx_design_specs_category ON design_specs(category);
CREATE INDEX IF NOT EXISTS idx_design_specs_created_at ON design_specs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_specs_is_favorite ON design_specs(is_favorite) WHERE is_favorite = true;

-- Enable RLS
ALTER TABLE design_specs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own design specs"
  ON design_specs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own design specs"
  ON design_specs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own design specs"
  ON design_specs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own design specs"
  ON design_specs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_design_specs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_design_specs_updated_at
  BEFORE UPDATE ON design_specs
  FOR EACH ROW
  EXECUTE FUNCTION update_design_specs_updated_at();