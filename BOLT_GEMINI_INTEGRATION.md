# Bolt/Gemini Integration Guide for architecture_manifest.json

## Overview

The `architecture_manifest.json` file is now production-ready as the canonical source-of-truth for the Continuum lanes-based reasoning system. Version 1.1 includes all critical fixes and guardrails for AI-assisted development.

---

## What Changed (v1.0 → v1.1)

### ✅ Critical Fixes Applied

1. **Removed non-existent `gpt-5`** from OpenAI models list
2. **Added 4 missing tables** to `clinical_recruiting` section:
   - `clinician_communication_profiles`
   - `reply_threads`
   - `reply_messages`
   - `clinician_interactions`
3. **Updated bundle sizes** to match latest build:
   - Main: 334 KB (104 KB gzipped)
   - ChatInterface: 159 KB (48 KB gzipped)
4. **Corrected file counts**:
   - 121 TypeScript files (was 68)
   - 8 edge functions (was 7)
   - 67 migration files (was 66)

### ✨ New Sections Added

1. **`constraints`** - Explicit guardrails for what cannot be modified
2. **`integration_instructions`** - Direct instructions for Bolt/Gemini
3. **`example_lane_config`** - Real production DeepThink lane configuration
4. **`common_queries`** - SQL patterns for standard operations
5. **Enhanced table documentation** with proper relationships and enum values

---

## Bolt.new System Prompt

Use this system prompt when integrating with Bolt.new:

```plaintext
# Architecture Context

You are working on the Continuum system - a lanes-based AI reasoning platform with multi-pass DeepThink execution.

## CRITICAL: Load Manifest First

Before making ANY architectural decisions:
1. Read `/architecture_manifest.json` (version 1.1+)
2. Internalize the lanes execution model: `ai_lanes → space_runs → ai_runs → artifacts + checks`
3. Review the `constraints` section for immutable components
4. Check `integration_instructions` for specific guidance

## Source of Truth

The manifest is canonical for:
- **Database schema** (67 migration files, 40+ tables)
- **Edge functions** (8 functions with specific purposes)
- **Execution flows** (DeepThink: planner → evidence → solvers → verifier)
- **Table relationships** (see `relationships_map`)
- **Constraints** (immutable tables, RLS requirements, enum values)

## Rules

**NEVER:**
- Rename or drop tables in `constraints.immutable_tables`
- Disable RLS on any table
- Modify existing migration files
- Implement `planned_verticals` (builder, sports) without explicit request
- Invent tables/functions not present in manifest

**ALWAYS:**
- Reference `common_queries` before writing new SQL
- Check `constraints` section before proposing schema changes
- Preserve enum values defined in `do_not_modify`
- Follow migration naming: `YYYYMMDD_description.sql`
- Maintain RLS policies on all tables

**QUERY PATTERNS:**
When fetching data, use patterns from `common_queries`:
- Conversation history: Use `session_id` for frontend lookups
- Cost tracking: Query `ai_cost_ledger` with time ranges
- Space runs: Always include `user_id` filter

## Verification Questions

Before proposing changes, ask yourself:
1. Does this conflict with `immutable_tables`?
2. Is this table/function already in the manifest?
3. Does this maintain RLS policies?
4. Does this follow the lanes execution model?
5. Am I implementing a `planned_only` vertical?

If uncertain, ask the user before proceeding.
```

---

## Gemini 3.0 System Prompt

Use this system prompt for Gemini 3.0 integration:

```plaintext
# System Architecture Context

You are an AI architect for the Continuum lanes-based reasoning platform.

## Manifest Authority

Load and reference `/architecture_manifest.json` (v1.1+) as the authoritative source for:
- Database schema (tables, columns, relationships, enums)
- Edge functions (location, purpose, modules)
- AI execution flows (lanes → space_runs → ai_runs)
- Provider models (Anthropic, Google, OpenAI)
- Constraints (what cannot be changed)

## Lanes Architecture

Understand the core execution model:

```
USER QUERY
    ↓
ai-chat-router (decides: simple chat vs DeepThink lane)
    ↓
SIMPLE PATH: Direct model call → SSE stream → done
    ↓
DEEPTHINK PATH:
    1. space_run created (with lane_id FK)
    2. planner pass (ai_run: pass_type='planner')
    3. evidence passes (retriever + reranker)
    4. N parallel solver passes (pass_candidate=1,2,3...)
    5. verifier pass (selects winner, sets is_winner=true)
    6. final_output written to space_run
    ↓
COST TRACKING: Each ai_run → ai_cost_ledger entry
```

## Critical Tables (DO NOT MODIFY)

From `constraints.immutable_tables`:
- `ai_lanes` - Pipeline configurations
- `space_runs` - Job executions
- `ai_runs` - Individual pass runs
- `ai_artifacts` - Evidence/snippets
- `ai_run_checks` - Verification results
- `ai_cache` - Response cache (SHA-256 keyed)
- `ai_cost_ledger` - Cost tracking (partitioned by month)

## Query Patterns

Reference `common_queries` section for standard operations:

**Get user's recent DeepThink runs:**
```sql
SELECT * FROM space_runs
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 50
```

**Get conversation by session_id (preferred for frontend):**
```sql
SELECT id, session_id, title
FROM ai_conversations
WHERE session_id = $1 AND user_id = $2
```

**Cost analysis (last 30 days):**
```sql
SELECT user_id, SUM(cost_usd) as total_cost
FROM ai_cost_ledger
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY total_cost DESC
```

## Planned vs Implemented

**DO NOT IMPLEMENT** without explicit request:
- `builder` vertical (code generation lanes)
- `sports` vertical (analytics)

**PARTIALLY IMPLEMENTED** (can extend):
- `recruiting` vertical (clinician management, reply assistant)

## Validation Checklist

Before suggesting changes:
- [ ] Does this modify `immutable_tables`? → REJECT
- [ ] Does this disable RLS? → REJECT
- [ ] Is this a `planned_only` feature? → ASK FIRST
- [ ] Does this follow `common_queries` patterns? → VERIFY
- [ ] Does this maintain enum values? → CHECK `do_not_modify`

## Model Information

From `ai_providers`:
- **Anthropic**: claude-3-5-sonnet-20240620 (complex reasoning)
- **Google**: gemini-1.5-flash-latest (DeepThink primary)
- **OpenAI**: gpt-4o (balanced performance)

**IMPORTANT**: No `gpt-5` exists. Do not reference it.

## When Unsure

If the manifest doesn't cover a specific case:
1. State what you found in the manifest
2. State what's missing
3. Ask user for clarification
4. DO NOT invent tables/functions not documented
```

---

## Integration Testing

### Test 1: Schema Understanding

**Prompt:** "What tables store DeepThink execution data?"

**Expected Response:**
Should list 7 core tables:
1. `ai_lanes` - Pipeline configs
2. `space_runs` - Job executions
3. `ai_runs` - Individual passes
4. `ai_artifacts` - Evidence
5. `ai_run_checks` - Verification
6. `ai_cache` - Response cache
7. `ai_cost_ledger` - Cost tracking

### Test 2: Constraint Enforcement

**Prompt:** "Can I rename space_runs to jobs?"

**Expected Response:**
Should REJECT with explanation:
- `space_runs` is in `constraints.immutable_tables`
- Production-stable, cannot be renamed
- Would break existing migrations and edge functions

### Test 3: Query Pattern Recognition

**Prompt:** "How do I fetch a conversation by its ID from the frontend?"

**Expected Response:**
Should reference `common_queries.get_conversation_by_session`:
```sql
SELECT id, session_id, title
FROM ai_conversations
WHERE session_id = $1 AND user_id = $2
```
And note: Use `session_id` (UUID) for frontend lookups, not database `id`.

### Test 4: Model Awareness

**Prompt:** "Should I use GPT-5 for the planner pass?"

**Expected Response:**
Should correct:
- GPT-5 doesn't exist in `ai_providers`
- Available models: claude-3-5-sonnet-20240620, gemini-1.5-flash-latest, gpt-4o
- Production DeepThink lanes use gemini-1.5-flash-latest

### Test 5: Planned Vertical Detection

**Prompt:** "Let's implement the builder_translation lane"

**Expected Response:**
Should warn:
- `builder` vertical is in `planned_verticals` with status "planned"
- DO NOT IMPLEMENT WITHOUT EXPLICIT REQUEST
- Ask user to confirm before proceeding

---

## Common Usage Patterns

### 1. Adding a New Table

**Correct Approach:**
```sql
-- ✅ GOOD: Create new table with RLS
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own preferences"
  ON user_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);
```

**Incorrect Approach:**
```sql
-- ❌ BAD: Modifies immutable table
ALTER TABLE space_runs ADD COLUMN user_notes TEXT;
```

### 2. Querying DeepThink Results

**Correct Approach:**
```typescript
// ✅ GOOD: Uses common_queries pattern
const { data: runs } = await supabase
  .from('space_runs')
  .select('id, status, verify_score, final_output')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(50);
```

**Incorrect Approach:**
```typescript
// ❌ BAD: No user_id filter (RLS will block anyway)
const { data: runs } = await supabase
  .from('space_runs')
  .select('*')
  .order('created_at', { ascending: false });
```

### 3. Adding a New Edge Function

**Correct Approach:**
1. Update manifest with new function in `edge_functions.support_functions`
2. Create function in `supabase/functions/my-function/index.ts`
3. Include CORS headers from `_shared/cors.ts`
4. Test locally with `supabase functions serve`
5. Deploy via Supabase CLI

**Incorrect Approach:**
- Creating function without updating manifest
- Forgetting CORS headers
- Not following `integration_instructions`

---

## Maintenance

### When to Update Manifest

Update `architecture_manifest.json` when:
- ✅ Adding new tables (schema changes)
- ✅ Adding new edge functions
- ✅ Changing execution flows
- ✅ Adding new enum values
- ✅ Updating bundle sizes (after major refactors)
- ✅ Implementing planned verticals

### Version Bumping

- **Patch (1.1 → 1.2)**: Minor corrections, file count updates
- **Minor (1.1 → 2.0)**: New tables, new functions, schema changes
- **Major (1.x → 2.x)**: Architectural paradigm shift

### Validation Script

Before committing manifest changes:

```bash
# 1. Verify JSON syntax
cat architecture_manifest.json | jq . > /dev/null && echo "✅ Valid JSON"

# 2. Count migrations
MANIFEST_COUNT=$(cat architecture_manifest.json | jq '.file_index.migration_files')
ACTUAL_COUNT=$(ls supabase/migrations/*.sql | wc -l)
echo "Manifest: $MANIFEST_COUNT, Actual: $ACTUAL_COUNT"

# 3. Count edge functions
MANIFEST_FUNCS=$(cat architecture_manifest.json | jq '.edge_functions.count')
ACTUAL_FUNCS=$(ls -d supabase/functions/*/ 2>/dev/null | wc -l)
echo "Manifest: $MANIFEST_FUNCS, Actual: $ACTUAL_FUNCS"

# 4. Verify build
npm run build
```

---

## Troubleshooting

### Issue: "Gemini suggests modifying space_runs"

**Solution:** Re-emphasize constraints:
```plaintext
REMINDER: space_runs is in constraints.immutable_tables.
This table is production-stable and cannot be modified.
Reference architecture_manifest.json section "constraints.do_not_modify".
```

### Issue: "Bolt invents non-existent tables"

**Solution:** Re-reference manifest:
```plaintext
Check architecture_manifest.json for existing tables.
The table you're looking for might exist under a different name.
Search "database.schemas.public" for all available tables.
```

### Issue: "SQL queries don't match patterns"

**Solution:** Point to common_queries:
```plaintext
Reference architecture_manifest.json section "common_queries".
These patterns are optimized and follow RLS requirements.
Adapt these patterns rather than writing from scratch.
```

---

## Success Criteria

The manifest integration is successful when:

✅ Bolt/Gemini can answer "What tables store X?" accurately
✅ Bolt/Gemini refuses to modify immutable tables
✅ Bolt/Gemini references common_queries for SQL patterns
✅ Bolt/Gemini warns before implementing planned verticals
✅ Bolt/Gemini preserves enum values and RLS policies
✅ Bolt/Gemini uses correct model names (no gpt-5)
✅ Bolt/Gemini understands lanes execution flow

---

## Next Steps

1. **Test integration** with sample prompts (see Integration Testing section)
2. **Monitor accuracy** - Track cases where manifest is referenced correctly
3. **Iterate** - Update manifest when gaps are discovered
4. **Version control** - Commit manifest changes with descriptive messages
5. **Documentation** - Keep this guide updated as patterns emerge

---

**Version:** 1.1
**Last Updated:** 2025-11-22
**Confidence:** 95% (validated against codebase)
**Status:** Production-ready ✅
