# Import Features Summary

## New Selection & Filtering Features

### What's New

You now have **complete control** over which clinicians to import from your CSV file.

### Key Features

#### 1. Interactive Checkboxes
- Click any clinician to toggle selection
- Visual feedback with blue highlight when selected
- All clinicians selected by default

#### 2. Search & Filter
- Search by name, email, or facility
- Results update instantly as you type
- Filters the displayed list without changing selections

#### 3. Bulk Selection Controls
- **Select All** - Selects all visible (filtered) clinicians
- **Deselect All** - Deselects all visible (filtered) clinicians
- Works with search results

#### 4. Live Counter Updates
- Shows "Selected: X" count in real-time
- Summary cards update based on selection
- Button shows "Import X Selected"

#### 5. Smart Import Button
- Automatically disabled if nothing selected
- Shows exact number being imported
- Prevents accidental empty imports

## How Selection Works

### Default State
- **All clinicians selected** when CSV is first loaded
- Most common use case: import everything except a few

### Selection Persistence
- Selections persist when you search
- Clearing search doesn't reset selections
- "Select All" / "Deselect All" only affects visible items

### Visual Indicators

**Selected Clinician:**
```
┌─────────────────────────────────────────┐
│ [✓] Sarah Johnson                       │ <- Blue background
│     sarah.j@email.com                   │
│     2 assignments • Stanford, UCLA      │
└─────────────────────────────────────────┘
```

**Not Selected:**
```
┌─────────────────────────────────────────┐
│ [ ] Mike Chen                            │ <- Gray background
│     mike.c@email.com                    │
│     1 assignment • Mayo Clinic          │
└─────────────────────────────────────────┘
```

## Example Workflows

### Workflow 1: Import Everything Except 3 People

1. Upload CSV → All 65 selected
2. Search for first person's name
3. Click to deselect
4. Repeat for other 2 people
5. Click "Import 62 Selected"

**Result:** 62 imported, 3 excluded

---

### Workflow 2: Import Only Stanford Clinicians

1. Upload CSV → All 65 selected
2. Click "Deselect All" → 0 selected
3. Search "Stanford"
4. Click "Select All" → 8 selected (only Stanford ones)
5. Clear search (selections stay)
6. Click "Import 8 Selected"

**Result:** Only 8 Stanford clinicians imported

---

### Workflow 3: Test with 5, Then Import Rest

**First batch:**
1. Upload CSV → All 65 selected
2. Click "Deselect All"
3. Manually select 5 clinicians
4. Click "Import 5 Selected"

**Second batch (later):**
1. Upload same CSV → All 65 selected
2. Search for the 5 already imported
3. Deselect each one
4. Click "Import 60 Selected"

**Result:** All 65 imported across 2 batches

---

### Workflow 4: Import by Assignment End Date Range

**Scenario:** Only import clinicians whose assignments end in next 6 weeks

1. Upload CSV → All 65 selected
2. Manually review list, deselect those with far-future end dates
3. Or: Filter CSV before upload to only include urgent ones
4. Click "Import X Selected"

**Tip:** Pre-filter your CSV in Excel/Sheets for date-based imports

---

### Workflow 5: Re-import Failed Records

**After first import with 3 failures:**

1. Note which 3 failed (shown in error list)
2. Fix issues in CSV
3. Upload corrected CSV → All selected
4. Search for each failed name
5. Deselect them (click to uncheck)
6. Invert: Click "Deselect All", then select only the 3 fixed ones
7. Click "Import 3 Selected"

**Result:** Only the 3 corrected records imported

## Pro Tips

### Tip 1: Use Search as a Selection Tool
```
Search "UCLA" → Shows 10 results
Click "Select All" → Only those 10 selected
Clear search → Still only 10 selected
Import 10 Selected
```

### Tip 2: Inverse Selection
```
Want to import everyone EXCEPT a group?
1. Search for the group
2. Click "Deselect All" (deselects only visible)
3. Clear search (others still selected)
4. Import remaining
```

### Tip 3: Batch Testing
```
Day 1: Select 5, test import
Day 2: Select 10 more, test conversations
Day 3: Select remaining 50, full rollout
```

### Tip 4: Facility-Based Filtering
```
You manage 3 facilities but CSV has all 10:
1. Search "Stanford" → Select All
2. Search "UCLA" → Select All
3. Search "Mayo" → Select All
4. Clear search → Only those 3 facilities selected
5. Import
```

### Tip 5: Quick Exclude
```
CEO says "Don't import anyone named John":
1. All selected by default
2. Search "John" → Shows 4 results
3. Click each to deselect
4. Clear search
5. Import everyone else
```

## Technical Details

### Selection State Management
- Uses JavaScript `Set` for efficient lookups
- Keyed by email (unique identifier)
- O(1) toggle performance
- Memory efficient even with 1000+ clinicians

### Search Algorithm
- Searches across name, email, and all facility names
- Case-insensitive
- Instant results (no debounce needed)
- Highlights matches visually

### Import Logic
```typescript
// Only selected clinicians are imported
const selectedClinicians = allClinicians.filter(c =>
  selectedEmails.has(c.email)
);

// Process in batches of 5
for (let i = 0; i < selectedClinicians.length; i += 5) {
  const batch = selectedClinicians.slice(i, i + 5);
  await processInParallel(batch);
}
```

## UI Breakdown

### Header Section
```
┌─────────────────────────────────────────────┐
│ Select Clinicians to Import                 │
│ Found 65 unique clinicians in your CSV.    │
│ Selected: 42                                │
└─────────────────────────────────────────────┘
```

### Summary Cards (Live Update)
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│    42    │ │    58    │ │    42    │ │    42    │
│ Profiles │ │Assignments│ │  Spaces  │ │  Notes   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
     ↑            ↑            ↑            ↑
  Updates with selection changes in real-time
```

### Search & Controls
```
┌─────────────────────────────────────────────┐
│ [Search by name, email, or facility...   ] │
└─────────────────────────────────────────────┘
               [Deselect All]
```

### Clinician List (Scrollable)
```
┌─────────────────────────────────────────────┐
│ [✓] Sarah Johnson                           │ <- Click to toggle
│     sarah.j@email.com                       │
│     2 assignments • Stanford, UCLA          │
├─────────────────────────────────────────────┤
│ [ ] Mike Chen                               │
│     mike.c@email.com                        │
│     1 assignment • Mayo Clinic              │
├─────────────────────────────────────────────┤
│ [✓] Amy Smith                               │
│     amy.s@email.com                         │
│     3 assignments • Various                 │
└─────────────────────────────────────────────┘
         (Scrollable list, max 320px)
```

### Footer Actions
```
┌─────────────────────────────────────────────┐
│  [Back]              [Import 42 Selected]   │
│                            ↑                │
│                     Disabled if 0 selected  │
└─────────────────────────────────────────────┘
```

## Benefits

### For Users
- **Flexibility**: Import exactly who you need
- **Safety**: Review before importing
- **Control**: Test with small batches first
- **Efficiency**: Search and bulk select

### For Testing
- Import 5 clinicians to test system
- Verify everything works
- Import the rest with confidence

### For Compliance
- Exclude clinicians who opted out
- Import only active contracts
- Maintain audit trail of who was imported

### For Performance
- Import in batches to avoid overload
- Test with small groups first
- Scale gradually

## Comparison: Before vs After

### Before (Terminal Script)
```bash
# All or nothing
npm run import:clinicians

# Imports ALL 65 clinicians
# No way to exclude specific ones
# No preview of what will happen
```

### After (UI with Selection)
```
1. Upload CSV
2. Preview all 65 clinicians
3. Deselect 3 you don't want
4. Click "Import 62 Selected"

✓ Visual preview
✓ Selective import
✓ Search and filter
✓ Bulk controls
```

## Future Enhancements (Not Built Yet)

Potential additions based on user feedback:

- **Save Selection Presets**: Save common selections (e.g., "Active Only")
- **Import History**: See what was imported when
- **Duplicate Detection**: Visual warning if clinician already exists
- **Column Mapping**: Map CSV columns to database fields
- **Validation Preview**: See potential errors before importing
- **Export Selection**: Download selected subset as new CSV
- **Multi-File Import**: Upload multiple CSVs, merge selections

## Summary

The new selection features give you **complete control** over the import process:

✅ **Preview** before importing
✅ **Select/deselect** individual clinicians
✅ **Search** to find specific people or groups
✅ **Bulk controls** for efficient selection
✅ **Live updates** showing exactly what will be imported
✅ **Disabled states** prevent accidents
✅ **Visual feedback** for all actions

**Bottom Line:** Import exactly who you need, when you need, how you need.
