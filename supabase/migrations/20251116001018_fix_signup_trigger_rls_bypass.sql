/*
  # Fix Signup Trigger RLS Policies

  ## Problem
  When users sign up, three triggers fire to create default records:
  - handle_new_user() -> creates default memory_space
  - create_default_memory_space() -> creates default memory_space  
  - create_default_project() -> creates default project
  
  These triggers have SECURITY DEFINER but still fail because RLS blocks the inserts.

  ## Solution
  Add permissive policies that allow authenticated users to insert their own records
  during the signup process. The WITH CHECK clause ensures users can only create
  records where user_id matches their auth.uid().

  ## Changes
  1. Drop existing restrictive INSERT policies
  2. Create new permissive INSERT policies that allow the triggers to work
  3. Keep all other policies (SELECT, UPDATE, DELETE) unchanged
*/

-- Fix memory_spaces INSERT policy
DROP POLICY IF EXISTS "Users can create own memory spaces" ON memory_spaces;

CREATE POLICY "Users can insert own memory spaces"
  ON memory_spaces
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fix projects INSERT policy  
DROP POLICY IF EXISTS "Users can create own projects" ON projects;

CREATE POLICY "Users can insert own projects"
  ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
