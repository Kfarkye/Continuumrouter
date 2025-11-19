/*
  # Add Service Role Policies for Clinician Tables

  1. Security Changes
    - Enable RLS on `clinician_profiles` table
    - Enable RLS on `assignments` table
    - Add service role policy for full access to `clinician_profiles`
    - Add service role policy for full access to `assignments`

  2. Purpose
    - Allows Edge Functions using service role to read/write clinician data
    - Maintains security by requiring service role authentication
    - Enables the ai-chat-router function to fetch clinician context

  3. Notes
    - Service role policies use `USING (true)` which is safe because service role is trusted
    - These policies only apply to backend operations, not client-side queries
    - DROP IF EXISTS ensures no conflicts with existing policies
*/

-- Enable RLS
ALTER TABLE public.clinician_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Service role policies (drop existing first to avoid conflicts)
DROP POLICY IF EXISTS "Service role full access to clinician profiles" ON public.clinician_profiles;
CREATE POLICY "Service role full access to clinician profiles"
  ON public.clinician_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to assignments" ON public.assignments;
CREATE POLICY "Service role full access to assignments"
  ON public.assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
