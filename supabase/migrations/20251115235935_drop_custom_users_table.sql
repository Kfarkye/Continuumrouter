/*
  # Drop Custom Users Table

  This migration removes the custom `users` table that conflicts with Supabase Auth's built-in user management.

  ## Changes
  - Drop the `public.users` table if it exists
  
  ## Rationale
  Supabase Auth automatically manages users in the `auth.users` table. Having a custom `users` table causes conflicts during signup/signin operations.
  
  ## Notes
  - All user authentication is handled by Supabase Auth's `auth.users` table
  - User metadata can be stored in `auth.users.raw_user_meta_data` or in separate profile tables linked by `auth.uid()`
*/

-- Drop the custom users table if it exists
DROP TABLE IF EXISTS public.users CASCADE;
