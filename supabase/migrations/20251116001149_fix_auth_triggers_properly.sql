/*
  # Fix Auth Triggers to Bypass RLS

  ## Problem
  - There are duplicate triggers trying to create memory_spaces
  - SECURITY DEFINER functions still respect RLS by default
  - During signup, auth.uid() is not yet set in the trigger context

  ## Solution
  1. Drop duplicate trigger and function
  2. Update remaining functions to explicitly disable RLS
  3. Use service role context to bypass RLS checks

  ## Changes
  - Remove duplicate `on_auth_user_created` trigger
  - Update functions to use `SET LOCAL` to bypass RLS
*/

-- Drop the duplicate trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Recreate the memory space function with proper RLS bypass
CREATE OR REPLACE FUNCTION public.create_default_memory_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass RLS for this operation
  SET LOCAL row_security = off;
  
  INSERT INTO memory_spaces (user_id, name, description)
  VALUES (NEW.id, 'Default', 'Your default memory space');
  
  RETURN NEW;
END;
$$;

-- Recreate the project function with proper RLS bypass
CREATE OR REPLACE FUNCTION public.create_default_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass RLS for this operation
  SET LOCAL row_security = off;
  
  INSERT INTO projects (user_id, name, description)
  VALUES (NEW.id, 'Default Project', 'Your default workspace');
  
  RETURN NEW;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_default_memory_space() TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_project() TO authenticated;
