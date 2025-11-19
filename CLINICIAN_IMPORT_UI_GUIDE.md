# Clinician Import UI - User Guide

## Overview

The Clinician Import feature provides a visual, user-friendly way to bulk import clinician data from CSV files directly in the app. No terminal commands or technical knowledge required!

## How to Access

1. Open your Continuum app
2. Look in the **left sidebar** under "Tools & Resources"
3. Click **"Import Clinicians"** (Upload icon)

## Step-by-Step Import Process

### Step 1: Upload CSV File

**Two ways to upload:**

1. **Drag & Drop**: Simply drag your CSV file onto the upload area
2. **Browse**: Click "Choose File" button to select from your computer

**Expected CSV Format:**

Your CSV should include these columns:
- Candidate Name (required)
- Email (required)
- Phone (optional)
- Phone 2 (optional)
- Facility (required)
- Start Date (required)
- End Date (required)
- Recruiter (optional)
- Account Manager (AM) (optional)
- Assignment Coordinator (AC) (optional)

### Step 2: Select Clinicians to Import

After uploading, you'll see an interactive selection screen:

**Summary Banner:**
- Total clinicians found in CSV
- Number currently selected (updates as you select/deselect)

**Live Preview Cards:**
- Clinician Profiles (updates with selection count)
- Assignments (calculates based on selected clinicians)
- Dedicated Spaces (matches selection count)
- Golden Notes (matches selection count)

**Search & Filter:**
- Search box to filter by name, email, or facility
- "Select All" / "Deselect All" button (works with filtered results)

**Interactive Clinician List:**
- ✅ Click any clinician to toggle selection
- Blue highlight indicates selected
- Shows name, email, assignments, and facilities
- Scrollable list (max height 320px)

**Selection Features:**
- **All selected by default** (you deselect what you don't want)
- Search filters the list but doesn't change selections
- "Select All" applies to currently visible (filtered) items
- Counter updates in real-time

**Actions:**
- **Back**: Return to upload screen to choose a different file
- **Import X Selected**: Import only the selected clinicians (disabled if none selected)

### Step 3: Watch Real-Time Progress

The import happens in the background with live progress bars:

1. **Clinician Profiles** (Blue bar)
   - Creates profile records with name, email, phone

2. **Assignments** (Cyan bar)
   - Creates assignment records with facility, dates, status

3. **Dedicated Spaces** (Purple bar)
   - Creates one chat space per clinician
   - Links space to clinician via clinician_id

4. **Golden Notes** (Green bar)
   - Adds initial note with recruiter and team info

**Processing Speed:**
- Processes in batches of 5 for stability
- 65 clinicians typically takes 30-60 seconds
- You can watch progress bars fill in real-time

### Step 4: Review Results

**Success Screen shows:**

- ✅ Total profiles created
- ✅ Total assignments created
- ✅ Total spaces created
- ✅ Total notes created

**If any imports failed:**
- See detailed error list with clinician name and error message
- Failed imports won't affect successful ones
- You can re-run import (system is idempotent - safe to retry)

## What Gets Created?

For each clinician in your CSV, the system creates:

### 1. Clinician Profile
```
✓ Full Name: Sarah Johnson
✓ Email: sarah.j@email.com
✓ Phone: 555-1234
✓ Linked to your user account
```

### 2. Assignment Record(s)
```
✓ Facility: Stanford Medical Center
✓ Start Date: 2024-10-01
✓ End Date: 2025-01-15
✓ Status: active
✓ Linked to clinician profile
```

### 3. Dedicated Space
```
✓ Space Name: Sarah Johnson
✓ Description: Healthcare professional at Stanford Medical Center
✓ System Prompt: AI instructions for Sarah's assistant
✓ Clinician ID Link: Bridges chat to data
```

### 4. Golden Note
```
✓ Content: "Imported from CSV. Recruiter: John. Team (AM/AC): Mary / Bob"
✓ Type: note
✓ Linked to clinician and space
```

## After Import: What's Next?

### 1. Find Your Clinician Spaces

- Click the **Space Selector** dropdown (top of screen)
- You'll see all clinician names listed
- Each one is a dedicated chat space

### 2. Start a Conversation

Open any clinician space and try these questions:

- "Who is this clinician?"
- "When does the current assignment end?"
- "What do we know about their preferences?"
- "Help me draft an extend message"

The AI will respond with full context awareness!

### 3. View Dashboard Data

Query the recruiter dashboard via SQL to see priority clinicians:

```sql
SELECT * FROM recruiter_dashboard
ORDER BY priority_order ASC
LIMIT 10;
```

This shows clinicians ranked by urgency (based on assignment end dates).

### 4. Add Golden Notes

You can add more context in two ways:

**Method 1: In Chat**
```
You: "Note: Sarah prefers day shift only. No night rotations."
AI: "Got it, I've saved that preference."
```

**Method 2: Via SQL**
```sql
INSERT INTO memories (
  clinician_id,
  project_id,
  user_id,
  kind,
  content
)
SELECT
  p.clinician_id,
  p.id,
  p.user_id,
  'preference',
  'Prefers day shifts. Interested in ICU roles.'
FROM projects p
WHERE p.name = 'Sarah Johnson';
```

## Common Selection Use Cases

### Use Case 1: Import Only Active Clinicians
1. Upload full CSV with all clinicians (active and inactive)
2. Use search to filter: Type "active" or a recent date
3. Deselect inactive clinicians
4. Import only the selected active ones

### Use Case 2: Import by Facility
1. Upload CSV
2. Search for facility name (e.g., "Stanford")
3. Click "Select All" to select only Stanford clinicians
4. Click "Deselect All" first if you want ONLY Stanford (clears others)
5. Import selected

### Use Case 3: Exclude Specific Clinicians
1. Upload CSV (all selected by default)
2. Search for clinician name
3. Click to deselect them
4. Clear search to see full list again (deselected stays deselected)
5. Import remaining selected clinicians

### Use Case 4: Import in Batches
**Scenario:** You have 200 clinicians and want to test with 20 first

1. Upload CSV
2. Click "Deselect All" (clears everything)
3. Manually select 20 clinicians
4. Import those 20
5. Later: Upload same CSV, select different 20, import

### Use Case 5: Re-import Failed Ones
1. First import completes with 5 failures
2. Fix issues in CSV (add missing data)
3. Upload corrected CSV
4. Search for the 5 failed names
5. Click "Select All" (selects only those 5)
6. Import just the corrected 5

## Visual Features

### Color-Coded Progress
- **Blue**: Profiles (core identity data)
- **Cyan**: Assignments (work history)
- **Purple**: Spaces (chat environments)
- **Green**: Notes (context memory)

### Status Icons
- **✓ Checkmark**: All imports successful
- **⚠ Warning**: Some imports failed
- **↻ Spinner**: Import in progress

### Interactive Selection
- **Blue highlight**: Clinician is selected for import
- **Gray background**: Clinician is not selected
- **Checkbox with ✓**: Shows selection state
- **Hover effect**: Visual feedback on clickable items

### Responsive Design
- Works on desktop and tablet
- Drag-and-drop on all devices
- Modal overlays for focused workflow
- Scrollable lists with smooth animations

## Troubleshooting

### "No columns found" or "CSV parsing error"

**Solution:**
- Ensure your CSV has a header row with column names
- Column names should match exactly (case-sensitive)
- Save as UTF-8 encoding

### "Duplicate key error" or "Already exists"

**Solution:**
- This is normal if you're re-importing
- System is idempotent (safe to re-run)
- Existing records will be updated, not duplicated
- Import will continue with other clinicians

### "Unauthorized" or "RLS policy violation"

**Solution:**
- Make sure you're logged in
- Verify your user ID is correct
- Check that .env variables are set

### Some clinicians didn't import

**Solution:**
- Check the error list at the end
- Common causes:
  - Missing required fields (name, email, facility)
  - Invalid date formats
  - Malformed CSV data
- Fix the CSV and re-import just those rows

### Progress bars stuck or not moving

**Solution:**
- Wait 1-2 minutes (large files take time)
- Check browser console for errors
- Refresh page and try again
- If persistent, check Supabase connection

## Best Practices

### Before Importing

1. **Backup your CSV**: Keep original file safe
2. **Test with small file**: Try 5-10 clinicians first
3. **Verify dates**: Ensure dates are formatted correctly (MM/DD/YYYY or YYYY-MM-DD)
4. **Check for duplicates**: Remove duplicate emails in CSV

### During Import

1. **Don't close browser**: Let import complete
2. **Don't refresh page**: Will interrupt process
3. **Watch for errors**: Review any failed imports

### After Import

1. **Verify count**: Check that numbers match expectations
2. **Test a few spaces**: Open 3-4 clinician spaces and test AI
3. **Review dashboard**: Query to see priority list
4. **Add notes**: Enhance context with additional golden notes

## Technical Details

### Batch Processing
- Imports 5 clinicians at a time
- Prevents database overload
- Maintains stability

### Idempotent Design
- Safe to re-run import
- Won't create duplicates
- Updates existing records

### Security
- RLS enforced (you only see your data)
- User ID verified on every operation
- Service role key kept secure on server

### Performance
- 65 clinicians: ~30-60 seconds
- 100 clinicians: ~1-2 minutes
- 500 clinicians: ~5-8 minutes

## Example Workflow

**Scenario: You have 65 Aya Healthcare clinicians in a CSV**

1. **Open app** → Click "Import Clinicians" in sidebar
2. **Upload** → Drag CSV file onto upload area
3. **Preview** → See "65 clinicians, 65 profiles, 78 assignments, 65 spaces, 65 notes"
4. **Confirm** → Click "Start Import"
5. **Wait** → Watch progress bars fill (30-60 seconds)
6. **Success** → See "Successfully imported all 65 clinicians"
7. **Test** → Open "Sarah Johnson" space, ask "When does assignment end?"
8. **AI Response** → "Sarah's assignment at Stanford Medical Center ends on January 15, 2025 - that's 28 days from now. Since we're inside the 6-week window, this is HIGH priority..."

Done! You now have 65 intelligent, context-aware AI assistants for your clinicians.

## Support

If you encounter issues:

1. Check RECRUITER_BRAIN_SETUP.md for technical details
2. Review Supabase logs for error messages
3. Query database directly to verify data
4. Re-run import (it's safe - idempotent design)

## Next Steps

After successful import:

- **Week 1**: Test with 5-10 clinicians, gather feedback
- **Week 2**: Add more golden notes based on conversations
- **Week 3**: Build dashboard UI if SQL queries prove useful
- **Week 4**: Train team on using the system

Remember: Start small, validate, then scale!
