# Email Integration Guide - How to Use

## Quick Start: Accessing the Email System

### Step 1: Apply Database Migration

First, apply the email system migration to your Supabase database:

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `supabase/migrations/20251118_email_system_tables.sql`
4. Run the migration
5. Verify tables were created: `email_drafts`, `email_sent_log`, `email_templates`, `template_performance`

### Step 2: Access the Dashboard

**In Continuum App:**

1. **Open your Continuum app** in the browser
2. **Look at the left sidebar** - you'll see navigation options
3. **Click "Dashboard"** (it's the second item with a Users icon)
4. You'll see the **Recruiter Dashboard** with all active clinician assignments

### Step 3: Send Your First Email

From the Dashboard:

1. **View clinician list** - sorted by urgency (days remaining)
2. Each row shows:
   - Clinician name and contact info
   - Current facility and assignment dates
   - Days remaining with priority badge
3. **Click "Send Email"** button on any clinician row
4. **Email composer opens** with:
   - Pre-populated clinician data
   - Recommended templates based on timeline
   - Template selection dropdown
5. **Select a template** (e.g., "Extension Request" for urgent cases)
6. **Edit the email** as needed
7. **Click "Send"** - opens in your default email client

## Navigation Map

```
Continuum App
│
├── Sidebar (Left)
│   ├── History (Chat sessions)
│   ├── Dashboard ← NEW! Click here
│   ├── DeepThink
│   ├── Tutorial Mode
│   └── Tools
│       ├── Prompt Vault
│       ├── Storage
│       └── Import Clinicians
│
└── Main Content
    ├── Dashboard View ← Where you'll spend time
    │   ├── Clinician rows with Send Email buttons
    │   └── Priority-sorted by days remaining
    │
    └── Email Modal ← Opens when you click Send Email
        ├── Template selector
        ├── Recommended templates
        ├── Email editor
        └── Send button
```

## Available Templates

### For Prospects (Outreach)
- **Initial Outreach** - Full job details with pay breakdown
- **Hourly Rate Offer** - Simplified hourly rate pitch
- **Re-engagement** - Reconnect with past prospects
- **Competitive Counter** - Beat competitor offers
- **Referral Request** - Ask for referrals

### For Active Assignments
- **Extension Request** - Request assignment extension (auto-recommended when <6 weeks)
- **Mid-Assignment Check-In** - General check-in (recommended at 6-8 weeks)
- **Margin Approval Request** - Internal operations request

### Quick Communication
- **Quick Pitch (Text)** - Short text message format
- **Extension Check (Text)** - Quick extension inquiry
- **Urgent (Text)** - Fast decision required

### Operations
- **Reassignment Request** - Internal reassignment
- **Documents & References** - Request required documents

## Timeline-Based Recommendations

The system automatically recommends templates based on assignment end dates:

- **≤ 28 days remaining** → "URGENT: Extension Request" (Red priority)
- **29-42 days remaining** → "Extension Request" (Red priority)
- **43-56 days remaining** → "Mid-Assignment Check-In" (Yellow priority)
- **57+ days remaining** → "On Track" (Green priority)

## Features

### Auto-Save Drafts
- Drafts auto-save every 2 seconds
- Linked to clinician_id
- Retrieved when you reopen email composer

### Email Tracking
- All sent emails logged to database
- Track outcomes: pending, responded, no_response, bounced
- View email history per clinician
- Performance analytics per template

### Template Performance
- Response rates calculated automatically
- Average response time tracked
- Conversion metrics available
- Most effective templates highlighted

## Data Flow

```
Dashboard Row
    ↓
[Send Email button clicked]
    ↓
Data Adapter transforms:
- clinician_profile → UnifiedEmailData
- assignment data → context
    ↓
Email Modal opens with:
- Pre-populated recipient
- Timeline-aware template suggestions
- Auto-filled variables
    ↓
[User selects template]
    ↓
Template generates:
- Subject line with facility/pay
- Body with all assignment details
- Personalized with recruiter name
    ↓
[User edits and sends]
    ↓
System logs:
- email_sent_log record
- template_performance update
- assignment.last_email_sent_at
    ↓
Opens in Outlook/Gmail
```

## Example Workflow

**Scenario: Clinician's assignment ends in 35 days**

1. Open Dashboard
2. See "Sarah Johnson" with RED "Extension Needed" badge
3. Click "Send Email"
4. Modal opens with recommended "Extension Request" template
5. Template auto-fills:
   ```
   Subject: Extension Opportunity at Stanford Medical Center
   Body: Hi Sarah, I hope everything is going great at Stanford...
         With 35 days remaining on your current assignment...
   ```
6. You edit: "I know you mentioned loving the Bay Area..."
7. Click Send → Opens in Outlook
8. Email logged with:
   - clinician_id linked
   - assignment_id linked
   - template_id: "extension_request"
   - sent_at timestamp

## Customization

### Add Your Own Templates

Via Supabase SQL:

```sql
INSERT INTO email_templates (
  user_id,
  name,
  category,
  stage,
  subject_template,
  body_template
) VALUES (
  'your-user-id',
  'My Custom Template',
  'outreach',
  'prospect',
  '{{specialty}} Job at {{facility}}',
  'Hi {{firstName}}, I have a great {{specialty}} position...'
);
```

### Track Email Outcomes

```sql
-- Mark email as responded
UPDATE email_sent_log
SET outcome = 'responded',
    response_received_at = now()
WHERE id = 'email-log-id';
```

### View Template Performance

```sql
SELECT
  template_id,
  total_sent,
  total_responded,
  (total_responded::float / total_sent) as response_rate
FROM template_performance
WHERE user_id = 'your-user-id'
ORDER BY total_sent DESC;
```

## Troubleshooting

**Can't see Dashboard option in sidebar:**
- Refresh the page
- Check that you're logged in
- Verify build completed successfully

**No clinicians showing on Dashboard:**
- Import clinicians first using "Import Clinicians" tool
- Verify assignments exist in database
- Check that assignments have status = 'active'

**Email doesn't send:**
- Email composer opens mailto link in default email client
- Check default email client is configured
- Email is logged even if you don't send

**Template variables not filling:**
- Check clinician data exists in database
- Verify assignment is linked to clinician
- Review data in `recruiter_dashboard` view

## Next Steps

1. **Import clinicians** if you haven't already
2. **Explore templates** - click through and see what's available
3. **Send test email** to yourself
4. **Track outcomes** in the database
5. **Create custom templates** for your specific workflows

---

**You're all set!** Start by clicking "Dashboard" in the sidebar to see your clinicians and send your first email.
