import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = process.env.IMPORT_USER_ID!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verify() {
  console.log('🔍 Verifying import...\n');

  const { data: profiles, error: profilesError } = await supabase
    .from('clinician_profiles')
    .select('*')
    .eq('user_id', USER_ID);

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    process.exit(1);
  }

  console.log(`✅ Clinician Profiles: ${profiles.length}`);

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('user_id', USER_ID);

  if (assignmentsError) {
    console.error('Error fetching assignments:', assignmentsError);
    process.exit(1);
  }

  console.log(`✅ Assignments: ${assignments.length}`);

  const { data: spaces, error: spacesError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', USER_ID)
    .not('clinician_id', 'is', null);

  if (spacesError) {
    console.error('Error fetching spaces:', spacesError);
    process.exit(1);
  }

  console.log(`✅ Clinician Spaces: ${spaces.length}`);

  const { data: memories, error: memoriesError } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', USER_ID)
    .not('clinician_id', 'is', null);

  if (memoriesError) {
    console.error('Error fetching memories:', memoriesError);
    process.exit(1);
  }

  console.log(`✅ Golden Notes: ${memories.length}`);

  const { data: dashboard, error: dashboardError } = await supabase
    .from('recruiter_dashboard')
    .select('*')
    .eq('user_id', USER_ID)
    .limit(5);

  if (dashboardError) {
    console.error('Error fetching dashboard:', dashboardError);
    process.exit(1);
  }

  console.log(`\n📊 Dashboard Preview (Top 5):\n`);
  dashboard.forEach(row => {
    console.log(`- ${row.full_name} at ${row.facility_name}`);
    console.log(`  End Date: ${row.end_date} (${row.days_remaining} days)`);
    console.log(`  Priority: ${row.trigger_type}\n`);
  });

  console.log('✨ Verification complete!');
}

verify().catch(console.error);
