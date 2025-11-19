# SPACES MVP - IMPLEMENTATION STATUS

**Last Updated:** 2025-11-17

---

## ✅ COMPLETED: Database Layer (DAY 1)

### Schema Changes
- ✅ `projects.system_prompt` column added (TEXT)
- ✅ `ai_conversations.space_id` column added (UUID, references projects)
- ✅ `uploaded_images.storage_path` column added (TEXT)
- ✅ `uploaded_images.signed_url` column added (TEXT)

### Performance Indexes
- ✅ `idx_memories_project_id_created_at` (composite index for fast space-scoped queries)
- ✅ `idx_ai_conversations_space_id` (conversation filtering)

### Security (RLS)
- ✅ RLS enabled on `projects` table
- ✅ Policy: "Users manage own spaces" on `projects`
- ✅ RLS enabled on `uploaded_images` table
- ✅ Policy: "Users manage own image records" on `uploaded_images`

### User Onboarding
- ✅ `user_onboarding_state` table created
- ✅ RLS policies applied
- ✅ Tracks `has_seen_spaces_intro` flag

---

## ✅ COMPLETED: Frontend Components (DAY 2)

### Existing Components
- ✅ `SpaceSelector.tsx` - Basic select dropdown for space selection
- ✅ `SpaceSettingsModal.tsx` - Create/edit spaces with system prompt
- ✅ `SpacesIntroModal.tsx` - Onboarding modal for spaces feature

**Status:** Already implemented, no changes needed.

---

## 🚧 TODO: Edge Function Updates (DAY 1)

### File: `supabase/functions/ai-chat-router/index.ts`

**Current Status:** Needs updating for Spaces MVP

**Required Changes:**

1. **Use RLS-Enabled Client**
   ```typescript
   // Replace SERVICE_ROLE_KEY with user JWT
   const supabase = createClient(
     Deno.env.get('SUPABASE_URL')!,
     Deno.env.get('SUPABASE_ANON_KEY')!, // NOT SERVICE_ROLE_KEY
     { global: { headers: { Authorization: authHeader } } }
   );
   ```

2. **Add Space Context Injection**
   ```typescript
   if (spaceId) {
     const [spaceResult, memoriesResult] = await Promise.all([
       supabase.from('projects').select('system_prompt').eq('id', spaceId).single(),
       supabase.from('memories')
         .select('content, type')
         .eq('project_id', spaceId)
         .order('created_at', { ascending: false })
         .limit(3)
     ]);
     // Add to messages array
   }
   ```

3. **Handle Signed URLs for Images**
   ```typescript
   const { data: images } = await supabase
     .from('uploaded_images')
     .select('signed_url')
     .in('id', imageIds);
   ```

4. **Update Conversation Link Post-Stream**
   ```typescript
   if (spaceId) {
     supabase
       .from('ai_conversations')
       .update({ space_id: spaceId, updated_at: new Date().toISOString() })
       .eq('id', conversationId);
   }
   ```

---

## 🚧 TODO: Wire Space to Chat (DAY 3)

### Install Package
```bash
npm install @microsoft/fetch-event-source
```

### Update Chat Hook
**File:** `src/hooks/useAiRouterChat.ts` or similar

**Required Changes:**
1. Accept `selectedSpace` parameter
2. Replace fetch with `fetchEventSource` for SSE streaming
3. Pass `spaceId` in request payload
4. Handle streaming chunks via `onmessage` callback
5. Handle completion via `[DONE]` signal

### Update Chat Interface
**File:** `src/components/ChatInterface.tsx`

**Required Changes:**
1. Add `selectedSpace` state management
2. Pass `selectedSpace` to `SpaceSelector` component
3. Pass `selectedSpace` to chat hook
4. Ensure space selector is visible in UI

---

## 🚧 TODO: Secure Image Upload (DAY 4)

### Storage Setup (Via Supabase Dashboard)
- [ ] Create `chat-uploads` bucket (set to PRIVATE)
- [ ] Add RLS policy: "Allow user uploads to their folder"
- [ ] Add RLS policy: "Allow user access to their images"

### Update ChatInputArea
**File:** `src/components/ChatInputArea.tsx`

**Required Changes:**
1. Add image upload state: `uploadedImages` (with `id` and `signed_url`)
2. Implement `handleImageUpload`:
   - Upload to private bucket with user folder structure
   - Generate signed URL (1 hour expiry)
   - Save metadata to `uploaded_images` table
3. Display image previews using `signed_url`
4. Pass `imageIds` to send handler
5. Clear uploaded images after send

---

## 🚧 TODO: Analytics & Deployment (DAY 5)

### Analytics Service
**File:** `src/services/analytics.ts`

**Required:**
- Simple event tracking to database
- Track: space_created, message_sent_in_space, image_uploaded

### Deployment Checklist
- [ ] Deploy updated `ai-chat-router` edge function
- [ ] Verify `OPENAI_API_KEY` in edge function environment
- [ ] Test RLS enforcement (cannot access other users' data)
- [ ] Test signed URL expiration
- [ ] Test streaming responses
- [ ] Test context injection (system prompt + top 3 memories)

---

## IMPLEMENTATION PRIORITY

**Week 1 (Days 1-3):** CORE FUNCTIONALITY
1. ✅ Database migrations (DONE)
2. 🚧 Update edge function for RLS + context injection
3. 🚧 Wire space selector to chat interface
4. 🚧 Implement SSE streaming in frontend

**Week 1 (Days 4-5):** POLISH & SECURITY
5. 🚧 Implement secure image uploads
6. 🚧 Add basic analytics
7. 🚧 Testing & deployment

---

## TESTING CHECKLIST

### Security Tests
- [ ] User A cannot access User B's spaces
- [ ] User A cannot access User B's images
- [ ] Images are not publicly accessible (only via signed URLs)
- [ ] Signed URLs expire after 1 hour
- [ ] Edge function uses user JWT (not service role)

### Functionality Tests
- [ ] Create space with system prompt
- [ ] Select space in chat interface
- [ ] Send message in space context
- [ ] Verify AI response respects system prompt
- [ ] Verify AI response includes recent memories
- [ ] Upload image in space
- [ ] Verify image preview works
- [ ] Verify AI can access image via signed URL

### UX Tests
- [ ] Responses stream in real-time (no lag)
- [ ] Error handling works (network failures, auth errors)
- [ ] Loading states are clear
- [ ] Spaces intro modal appears for new users
- [ ] Can dismiss spaces intro modal

---

## REFERENCE DOCUMENTS

- **Implementation Guide:** `SPACES_MVP_RUTHLESS_IMPLEMENTATION.md`
- **Original MVP Plan:** `SPACES_MVP_IMPLEMENTATION.md`
- **Intro Feature Design:** `SPACES_INTRO_FEATURE.md`
- **Database Migration:** `supabase/migrations/20251117_spaces_mvp_updated.sql`
- **Onboarding Migration:** `supabase/migrations/20251117_user_onboarding_state.sql`

---

## QUICK START

To continue implementation:

1. **Update Edge Function:**
   ```bash
   # Edit: supabase/functions/ai-chat-router/index.ts
   # Follow the pattern in SPACES_MVP_RUTHLESS_IMPLEMENTATION.md
   ```

2. **Install SSE Library:**
   ```bash
   npm install @microsoft/fetch-event-source
   ```

3. **Update Chat Hook:**
   ```bash
   # Edit: src/hooks/useAiRouterChat.ts
   # Replace fetch with fetchEventSource
   ```

4. **Test Locally:**
   ```bash
   npm run dev
   # Test space creation, selection, and context injection
   ```

5. **Deploy:**
   ```bash
   # Deploy edge function via Supabase CLI or dashboard
   # Deploy frontend to hosting provider
   ```
