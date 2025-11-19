import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import * as fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = process.env.IMPORT_USER_ID!;
const CSV_PATH = process.env.CSV_PATH || './Working_Candidates_11_09_25.csv';
const BATCH_SIZE = 20;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error("Missing environment variables:");
  console.error("- VITE_SUPABASE_URL");
  console.error("- SUPABASE_SERVICE_ROLE_KEY");
  console.error("- IMPORT_USER_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CSVRow {
  'Candidate Name': string;
  'Email': string;
  'Phone': string;
  'Phone 2': string;
  'Facility': string;
  'Start Date': string;
  'End Date': string;
  'Recruiter': string;
  'Account Manager (AM)': string;
  'Assignment Coordinator (AC)': string;
}

interface ClinicianData {
  name: string;
  email: string;
  phones: string[];
  recruiter: string;
  team: {
    am_ac: string;
  };
  assignments: Array<{
    facility: string;
    startDate: string;
    endDate: string;
  }>;
}

function parseDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function groupByClinician(rows: CSVRow[]): Map<string, ClinicianData> {
  const clinicians = new Map<string, ClinicianData>();

  for (const row of rows) {
    const name = row['Candidate Name']?.trim();
    const email = row['Email']?.trim();

    if (!name || !email) continue;

    if (!clinicians.has(email)) {
      clinicians.set(email, {
        name,
        email,
        phones: [],
        recruiter: row['Recruiter']?.trim() || '',
        team: {
          am_ac: `${row['Account Manager (AM)']?.trim() || ''} / ${row['Assignment Coordinator (AC)']?.trim() || ''}`,
        },
        assignments: [],
      });
    }

    const clinician = clinicians.get(email)!;

    const phone = row['Phone']?.trim();
    const phone2 = row['Phone 2']?.trim();
    if (phone && !clinician.phones.includes(phone)) {
      clinician.phones.push(phone);
    }
    if (phone2 && !clinician.phones.includes(phone2)) {
      clinician.phones.push(phone2);
    }

    const facility = row['Facility']?.trim();
    const startDate = row['Start Date']?.trim();
    const endDate = row['End Date']?.trim();

    if (facility && startDate && endDate) {
      clinician.assignments.push({
        facility,
        startDate,
        endDate,
      });
    }
  }

  return clinicians;
}

function getSystemPrompt(clinicianName: string): string {
  const firstName = clinicianName.split(' ')[0];
  return `You are Aya's AI assistant helping manage the career of healthcare traveler ${clinicianName}.

IMPORTANT: When the user mentions "${firstName}" they are referring to ${clinicianName}, the clinician you are helping manage.

CONTEXT PROVIDED (Dynamically Injected):
- Structured Profile data (name, email, phone)
- Current Assignment details (facility, dates, status)
- Golden Notes/Memories (important preferences and history)

YOUR ROLE:
1. Track assignment timelines proactively
2. Suggest personalized outreach based on end dates and Golden Notes
3. Draft communications that are warm, concise, and actionable
4. Answer questions about ${firstName}'s current situation and career

NAVIGATOR TIMELINE LOGIC:
- 6+ weeks before end: Suggest initiating "Extend or Explore?" conversation
- 4-6 weeks: Increase urgency "Secure decision soon"
- <4 weeks: CRITICAL "Urgent - finalize next steps to avoid gaps"

When asked about ${firstName}, provide relevant information about this clinician's profile, assignments, and career management.`;
}

async function processClinician(clinician: ClinicianData) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('clinician_profiles')
      .upsert({
        user_id: USER_ID,
        full_name: clinician.name,
        email: clinician.email,
        phone: clinician.phones[0] || null,
      }, { onConflict: 'user_id,email' })
      .select('id')
      .single();

    if (profileError) throw profileError;
    const clinicianId = profile.id;

    const assignments = clinician.assignments.map((a) => ({
      clinician_id: clinicianId,
      user_id: USER_ID,
      facility_name: a.facility,
      start_date: parseDate(a.startDate),
      end_date: parseDate(a.endDate),
      status: 'active',
    })).filter((a) => a.start_date && a.end_date);

    if (assignments.length > 0) {
      const { error: assignmentError } = await supabase.from('assignments').insert(assignments);
      if (assignmentError && assignmentError.code !== '23505') {
        throw assignmentError;
      }
    }

    let { data: space } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('clinician_id', clinicianId)
      .maybeSingle();

    if (!space) {
      const { data: newSpace, error: spaceError } = await supabase
        .from('projects')
        .insert({
          user_id: USER_ID,
          name: clinician.name,
          description: `Healthcare professional at ${assignments[0]?.facility_name || 'various facilities'}`,
          clinician_id: clinicianId,
          system_prompt: getSystemPrompt(clinician.name),
        })
        .select('id')
        .single();

      if (spaceError) throw spaceError;
      space = newSpace;
    }

    const noteContent = `Imported from CSV. Recruiter: ${clinician.recruiter}. Team (AM/AC): ${clinician.team.am_ac}`;

    const { data: existingNote } = await supabase
      .from('memories')
      .select('id')
      .eq('clinician_id', clinicianId)
      .eq('content', noteContent)
      .maybeSingle();

    if (!existingNote) {
      await supabase.from('memories').insert({
        project_id: space.id,
        clinician_id: clinicianId,
        user_id: USER_ID,
        kind: 'note',
        content: noteContent,
      });
    }

    return { success: true, name: clinician.name };
  } catch (error: any) {
    return { success: false, name: clinician.name, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting hybrid import...\n');

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV file not found at: ${CSV_PATH}`);
    console.error('Set CSV_PATH environment variable to the correct path.');
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const { data: rows, errors } = Papa.parse<CSVRow>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (v) => v.trim(),
  });

  if (errors.length > 0) {
    console.warn('⚠️ CSV Parsing warnings (showing first 5):', errors.slice(0, 5));
  }

  const clinicians = groupByClinician(rows);
  const clinicianArray = Array.from(clinicians.values());

  console.log(`Found ${clinicianArray.length} unique clinicians.\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < clinicianArray.length; i += BATCH_SIZE) {
    const batch = clinicianArray.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clinicianArray.length / BATCH_SIZE)}...`);

    const results = await Promise.all(batch.map(processClinician));

    results.forEach(r => {
      if (r.success) {
        successCount++;
        console.log(`✅ ${r.name}`);
      } else {
        console.log(`❌ Failed: ${r.name}: ${r.error}`);
        failCount++;
      }
    });
  }

  console.log(`\n✨ Import complete!`);
  console.log(`Success: ${successCount}, Failed: ${failCount}`);
}

main().catch(console.error);
