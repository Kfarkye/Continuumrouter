# Aya Healthcare Recruiter Brain - Setup Guide

## Overview

This system implements a hybrid architecture that combines:
- **Dashboard-First**: Relational tables (clinician_profiles, assignments) for efficient querying
- **Chat-First**: One dedicated space per clinician for rich, context-aware conversations
- **The Bridge**: clinician_id column links spaces to structured data

## Quick Start

### 1. Database Setup

The migration has already been applied to your Supabase database with:
- `clinician_profiles` table
- `assignments` table
- Links to `projects`, `memories`, and `ai_conversations`
- `recruiter_dashboard` view with priority logic
- `get_clinician_context()` RPC function

### 2. Import Clinicians from CSV

**Prerequisites:**
- CSV file with columns: Candidate Name, Email, Phone, Phone 2, Facility, Start Date, End Date, Recruiter, Account Manager (AM), Assignment Coordinator (AC)
- Your Supabase URL and Service Role Key (from .env file)
- Your user ID (from Supabase Auth)

**Run the import:**

```bash
# Set environment variables
export IMPORT_USER_ID="your-user-id-here"
export CSV_PATH="./path/to/your/Working_Candidates.csv"

# Run import
npm run import:clinicians
```

The import script will:
- Create a clinician profile for each unique email
- Create assignment records for each facility/date combination
- Create one dedicated space per clinician
- Add an initial "golden note" with recruiter and team info
- Process in batches of 20 for efficiency

**Verify the import:**

```bash
npm run verify:import
```

This will show:
- Number of clinician profiles created
- Number of assignments created
- Number of spaces created
- Number of golden notes added
- Preview of the dashboard data

### 3. Test the Dashboard Query

In your Supabase SQL Editor:

```sql
SELECT * FROM recruiter_dashboard
ORDER BY priority_order ASC, end_date ASC
LIMIT 10;
```

This will show clinicians with active assignments, prioritized by end date:
- **extend_or_explore**: Assignment ending in 6 weeks or less (HIGH priority)
- **check_in**: Assignment ending in 6-8 weeks (MEDIUM priority)
- **no_action**: Assignment ending in more than 8 weeks

### 4. Test Context Injection

1. Open your Continuum app
2. Navigate to a clinician's space (look for spaces named after clinicians)
3. Start a conversation and ask:
   - "Who is this clinician?"
   - "When does the current assignment end?"
   - "What do we know about their preferences?"

The AI should respond with accurate information from:
- Clinician profile (name, email, phone)
- Current assignment (facility, end date, days remaining)
- Golden notes (recruiter, team info, preferences)
- Timeline awareness (urgency level based on end date)

## How It Works

### Database Schema

**clinician_profiles**: Core profile data
- id, user_id, full_name, email, phone
- Unique constraint on (user_id, email) for idempotent imports

**assignments**: Assignment history
- id, clinician_id, user_id, facility_name, start_date, end_date, status
- Linked to clinician_profiles via clinician_id

**projects**: Spaces (with new columns)
- clinician_id: Links space to clinician (THE KEY BRIDGE)
- system_prompt: AI instructions specific to this clinician

**memories**: Golden notes
- clinician_id: Links memory to clinician
- Used for preferences, concerns, goals, history

**ai_conversations**: Conversation tracking
- clinician_id: Links conversation to clinician
- project_id: Links to space

### Context Injection Flow

1. User opens a clinician space
2. Frontend loads space and detects clinician_id
3. User sends a message
4. Edge function calls get_clinician_context(clinician_id, user_id)
5. Function returns JSON with profile, assignments, and memories
6. Edge function builds context string with:
   - Profile details
   - Current assignment with days remaining
   - Urgency level based on timeline
   - Golden notes
7. Context is injected as system message
8. AI responds with full context awareness

### System Prompt Logic

Each clinician space has a system prompt that instructs the AI to:
- Track assignment timelines proactively
- Suggest personalized outreach based on end dates
- Draft warm, concise, actionable communications

**Navigator Timeline Logic:**
- 6+ weeks before end: "Extend or Explore?" conversation
- 4-6 weeks: Increase urgency - "Secure decision soon"
- <4 weeks: CRITICAL - "Urgent - finalize next steps"

## Usage

### Adding Manual Notes

You can add golden notes directly via SQL:

```sql
INSERT INTO memories (
  project_id,
  clinician_id,
  user_id,
  kind,
  content
)
SELECT
  p.id,
  p.clinician_id,
  p.user_id,
  'preference',
  'Prefers West Coast locations. Interested in ICU positions.'
FROM projects p
WHERE p.clinician_id = 'clinician-uuid-here';
```

Or simply mention important details in the chat and they'll be captured automatically.

### Querying Dashboard Data

```sql
-- High priority clinicians (ending soon)
SELECT * FROM recruiter_dashboard
WHERE trigger_type = 'extend_or_explore'
ORDER BY days_remaining ASC;

-- Medium priority clinicians
SELECT * FROM recruiter_dashboard
WHERE trigger_type = 'check_in'
ORDER BY days_remaining ASC;

-- All active assignments for a specific clinician
SELECT * FROM assignments
WHERE clinician_id = 'clinician-uuid-here'
  AND status = 'active';
```

### Updating Assignment Status

```sql
-- Mark an assignment as completed
UPDATE assignments
SET status = 'completed'
WHERE id = 'assignment-uuid-here';
```

## What NOT to Build Yet

Based on the minimal viable implementation approach:

- ❌ Dashboard UI component (query SQL first to validate usefulness)
- ❌ Golden notes panel (add notes manually or via chat)
- ❌ CSV import modal (terminal script works fine)
- ❌ Clinician context banner (test if users need visual indicator)
- ❌ Import history tracking (track manually in spreadsheet)
- ❌ Dry-run mode (import is idempotent, safe to rerun)
- ❌ Note editing UI (edit via SQL if needed)

**Build these only after user feedback indicates they're necessary.**

## Testing Checklist

- [ ] Run migration successfully
- [ ] Import CSV data without errors
- [ ] Verify clinician profiles created
- [ ] Verify assignments created
- [ ] Verify spaces created with clinician_id links
- [ ] Verify golden notes created
- [ ] Query dashboard view successfully
- [ ] Open a clinician space in the app
- [ ] Send message and verify AI has context
- [ ] Test timeline awareness (ask about end dates)
- [ ] Test memory retrieval (ask about preferences)
- [ ] Verify RLS prevents unauthorized access

## Troubleshooting

**Import fails with "Missing environment variables":**
- Ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in .env
- Set IMPORT_USER_ID environment variable before running import

**AI doesn't have clinician context:**
- Verify space has clinician_id: `SELECT clinician_id FROM projects WHERE id = 'space-id'`
- Check get_clinician_context returns data: `SELECT get_clinician_context('clinician-id', 'user-id')`
- Check edge function logs for errors

**Dashboard query returns no results:**
- Verify assignments have status = 'active'
- Verify end_date is in the future
- Check: `SELECT COUNT(*) FROM assignments WHERE status = 'active' AND end_date >= CURRENT_DATE`

**RLS blocks access:**
- Verify user_id matches authenticated user
- Check RLS policies are enabled: `SELECT * FROM pg_policies WHERE tablename IN ('clinician_profiles', 'assignments')`

## Next Steps

After validating the core functionality:

1. **Get user feedback**: Have recruiters test the system with real conversations
2. **Measure success**: Track whether AI provides useful context and suggestions
3. **Decide what to build**: Based on feedback, build ONE feature from the excluded list
4. **Iterate**: Don't build everything at once - ship incrementally

## Support

For issues or questions:
1. Check Supabase logs for edge function errors
2. Query database directly to verify data
3. Test RLS policies with different user IDs
4. Review edge function code for context injection logic
