/*
  # Fix get_clinician_context RPC Function
  
  1. Changes
    - Fix json_agg with ORDER BY syntax error
    - Use subquery to properly order assignments before aggregation
    
  2. Notes
    - The issue was using ORDER BY directly in json_agg without proper subquery
    - Now uses a subquery to order results before aggregation
*/

CREATE OR REPLACE FUNCTION get_clinician_context(p_clinician_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_profile JSON;
  v_assignments JSON;
  v_memories JSON;
  v_result JSON;
BEGIN
  -- Verify user owns this clinician
  IF NOT EXISTS (
    SELECT 1 FROM clinician_profiles
    WHERE id = p_clinician_id AND user_id = p_user_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Get profile
  SELECT row_to_json(cp.*) INTO v_profile
  FROM clinician_profiles cp
  WHERE cp.id = p_clinician_id;

  -- Get active assignments (fixed ORDER BY in subquery)
  SELECT json_agg(assignment_data) INTO v_assignments
  FROM (
    SELECT *
    FROM assignments a
    WHERE a.clinician_id = p_clinician_id
      AND a.status = 'active'
    ORDER BY a.end_date ASC
  ) assignment_data;

  -- Get recent memories (golden notes)
  SELECT json_agg(memory_data) INTO v_memories
  FROM (
    SELECT content, created_at, kind
    FROM memories
    WHERE clinician_id = p_clinician_id
    ORDER BY created_at DESC
    LIMIT 10
  ) memory_data;

  -- Combine into single JSON object
  v_result := json_build_object(
    'profile', v_profile,
    'assignments', COALESCE(v_assignments, '[]'::json),
    'memories', COALESCE(v_memories, '[]'::json)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;