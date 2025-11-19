# CONTINUUM SPACES MVP - RUTHLESS YET VIABLE IMPLEMENTATION

**Goal:** Ship in 5 days. Validate the core assumption. Maintain essential UX and Security.

**Cuts:** RAG, Zustand, RHF/Zod, Image Compression, PostHog, Real-time, Combobox.

---

## DAY 1: SECURE DB (RLS) + STREAMING EDGE FUNCTION (SIMPLE CONTEXT)

**Focus:** Security (RLS enforcement), Streaming implementation, and simple context retrieval.

### Migration: 20251117_spaces_mvp_updated.sql

**Status:** ✅ APPLIED

The migration adds:
- `system_prompt` column to `projects` table
- `space_id` column to `ai_conversations` table
- `storage_path` and `signed_url` columns to `uploaded_images`
- Composite index: `idx_memories_project_id_created_at` (optimized for space-scoped queries)
- Index: `idx_ai_conversations_space_id`
- RLS policies for `projects` and `uploaded_images` tables

### Edge Function: supabase/functions/ai-chat-router/index.ts

**Key Requirements:**

1. **Authentication & RLS**
   - CRITICAL: Initialize Supabase client with user's JWT to enforce RLS
   - DO NOT use SERVICE_ROLE_KEY

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const authHeader = req.headers.get('Authorization');
if (!authHeader) return new Response('Unauthorized', { status: 401 });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader } } }
);
```

2. **Context Injection (Simplified - No RAG)**

```typescript
if (spaceId) {
  // Fetch space and memories concurrently (RLS enforced)
  const [spaceResult, memoriesResult] = await Promise.all([
    supabase.from('projects').select('system_prompt').eq('id', spaceId).single(),
    // Simple retrieval: Top 3 recent memories
    supabase.from('memories')
      .select('content, type')
      .eq('project_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(3)
  ]);

  if (spaceResult.data?.system_prompt?.trim()) {
    messages.push({ role: 'system', content: spaceResult.data.system_prompt.trim() });
  }

  if (memoriesResult.data && memoriesResult.data.length > 0) {
    const memoryContext = memoriesResult.data.map(m => `[${m.type}] ${m.content}`).join('\n');
    messages.push({ role: 'system', content: `Recent Context:\n${memoryContext}` });
  }
}
```

3. **History & Secure Images**

```typescript
// History (RLS enforced)
const { data: history } = await supabase
  .from('ai_messages')
  .select('role, content')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true });

if (history) {
  messages.push(...history.filter(msg => msg.role !== 'system'));
}

// Image fetching (using Signed URLs - RLS enforced)
let imageContent = [];
if (imageIds && imageIds.length > 0) {
  const { data: images } = await supabase
    .from('uploaded_images')
    .select('signed_url')
    .in('id', imageIds);

  if (images) {
    imageContent = images.map(img => ({
      type: 'image_url',
      image_url: { url: img.signed_url, detail: 'auto' }
    }));
  }
}
```

4. **Streaming Response (Essential UX)**

```typescript
import { OpenAI } from 'https://esm.sh/openai@4';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });

const stream = await openai.chat.completions.create({
  model: model || 'gpt-4o',
  messages: messages,
  stream: true,
});

// Pipe the response using TransformStream for SSE formatting
const { readable, writable } = new TransformStream();
const writer = writable.getWriter();
const encoder = new TextEncoder();

(async () => {
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
  }
  await writer.write(encoder.encode('data: [DONE]\n\n'));
  await writer.close();

  // POST-STREAM: Update conversation link asynchronously (RLS enforced)
  if (spaceId) {
    supabase
      .from('ai_conversations')
      .update({ space_id: spaceId, updated_at: new Date().toISOString() })
      .eq('id', conversationId);
  }
})();

return new Response(readable, {
  headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
});
```

---

## DAY 2: MINIMALIST FRONTEND COMPONENTS

**Focus:** useState, simple forms, basic select dropdown. No Zustand/RHF/Zod.

### Components: SpaceSelector.tsx & SpaceSettingsModal.tsx

**Status:** ✅ ALREADY EXIST

**Key Features:**
- Uses `useState` for managing the list of spaces and form state
- Uses a basic `<select>` element (not a complex Combobox)
- Implements simple validation (e.g., `if (!name.trim()) { alert('Name required'); return; }`)
- No real-time subscriptions - parent component triggers refetch when modal closes

**Implementation Note:** These components are already implemented in the codebase. No changes needed.

---

## DAY 3: WIRE SPACE TO STREAMING CHAT FLOW

**Focus:** Integrating the simple UI with the streaming backend.

### Install Required Package

```bash
npm install @microsoft/fetch-event-source
```

### Update: ChatInterface.tsx or ChatHeader

**Manage Selected Space:**
- Use `useState` to manage `selectedSpace`
- Pass it down to the chat input/send handler

```typescript
const [selectedSpace, setSelectedSpace] = useState<string | null>(null);

// Pass to SpaceSelector
<SpaceSelector
  selectedSpace={selectedSpace}
  onSpaceChange={setSelectedSpace}
/>
```

### Update: Chat Hook (for Streaming)

**Rationale:** Standard fetch cannot handle SSE; we must use a library like `@microsoft/fetch-event-source`.

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { supabase } from '@/lib/supabase';

export function useChatMessages(conversationId: string, selectedSpace: string | null) {
  const sendMessage = async (
    content: string,
    imageIds?: string[],
    onChunkReceived: (chunk: string) => void,
    onComplete: () => void
  ) => {
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const payload = { conversationId, message: content, spaceId: selectedSpace, imageIds };

      // Use fetchEventSource to handle the SSE stream
      await fetchEventSource(`${supabaseUrl}/functions/v1/ai-chat-router`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        onmessage(event) {
          if (event.data === '[DONE]') {
            onComplete();
            return;
          }
          try {
            const json = JSON.parse(event.data);
            if (json.content) {
              onChunkReceived(json.content);
            }
          } catch (e) {
            console.error("Error parsing stream chunk", e);
          }
        },
        onerror(err) {
          console.error("Stream error:", err);
          throw err; // Stop retrying
        },
      });
    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  };

  return { sendMessage };
}
```

---

## DAY 4: SECURE IMAGE UPLOAD UI

**Focus:** Private buckets, RLS, and Signed URLs. No compression or Dropzone library.

### Storage RLS Policies

**Note:** These must be created via Supabase Dashboard or separate storage API call.

```sql
-- RLS Policy: Users can upload only to their own folder
CREATE POLICY "Allow user uploads to their folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS Policy: Users can only view their own images
CREATE POLICY "Allow user access to their images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-uploads' AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### Update: ChatInputArea.tsx (Secure Implementation)

```typescript
interface UploadedImageRecord {
  id: string;
  signed_url: string;
}

export function ChatInputArea({ onSend }: { onSend: (message: string, imageIds?: string[]) => void }) {
  const [message, setMessage] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImageRecord[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      const newImageRecords: UploadedImageRecord[] = [];
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      for (const file of Array.from(files)) {
        // 1. Upload to PRIVATE storage bucket
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('chat-uploads')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // 2. Create Signed URL (Valid for 1 hour)
        const { data: signedUrlData, error: signError } = await supabase.storage
          .from('chat-uploads')
          .createSignedUrl(fileName, 3600);

        if (signError || !signedUrlData) throw signError;

        // 3. Save metadata
        const { data: image, error: dbError } = await supabase
          .from('uploaded_images')
          .insert([{
            user_id: user.id,
            storage_path: fileName,
            signed_url: signedUrlData.signedUrl,
          }])
          .select('id, signed_url')
          .single();

        if (dbError) throw dbError;
        newImageRecords.push(image);
      }

      setUploadedImages(prev => [...prev, ...newImageRecords]);
    } catch (error) {
      alert(`Failed to upload images: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    const imageIds = uploadedImages.map(img => img.id);
    if (!message.trim() && imageIds.length === 0) return;

    await onSend(message, imageIds);
    setMessage('');
    setUploadedImages([]);
  };

  return (
    <div className="space-y-2">
      {/* Image previews (Use signed_url for src) */}
      {uploadedImages.length > 0 && (
        <div className="flex gap-2 px-4">
          {uploadedImages.map((img, idx) => (
            <div key={img.id} className="relative">
              <img src={img.signed_url} className="w-16 h-16 rounded object-cover" alt="Upload preview" />
              <button
                onClick={() => setUploadedImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File input */}
      <div className="px-4">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          disabled={uploading}
          className="text-sm"
        />
      </div>

      {/* Message input */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your message..."
        className="w-full px-4 py-2 rounded border"
        rows={3}
      />

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={uploading || (!message.trim() && uploadedImages.length === 0)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Send'}
      </button>
    </div>
  );
}
```

---

## DAY 5: ANALYTICS & DEPLOYMENT

**Focus:** Minimal tracking and deployment.

### Analytics Helper (Simple DB Insert)

Create a simple analytics service that logs events to the database:

```typescript
// services/analytics.ts
import { supabase } from '@/lib/supabase';

export async function trackEvent(eventName: string, properties?: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('analytics_events').insert([{
      user_id: user?.id,
      event_name: eventName,
      properties: properties || {},
      created_at: new Date().toISOString(),
    }]);
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
}
```

**Usage:**
```typescript
// Track space creation
trackEvent('space_created', { space_id: newSpace.id });

// Track message sent in space
trackEvent('message_sent_in_space', { space_id: selectedSpace });

// Track image upload
trackEvent('image_uploaded', { image_count: files.length });
```

---

## TESTING FOCUS

### 1. Security: RLS Enforcement
- ✅ Verify Edge Function cannot access unauthorized spaces/memories
- ✅ Test that User A cannot access User B's spaces or images
- ✅ Verify all database queries use the user's JWT (not service role)

### 2. Security: Private Image Storage
- ✅ Verify image uploads are private (not publicly accessible)
- ✅ Verify only signed URLs work for image access
- ✅ Test signed URL expiration (after 1 hour)

### 3. UX: Streaming
- ✅ Verify responses stream correctly (SSE)
- ✅ Test error handling (network failures, auth errors)
- ✅ Verify [DONE] signal triggers completion

### 4. Core: Context Injection
- ✅ Verify system prompt is respected by AI
- ✅ Verify top 3 memories are included in context
- ✅ Test with/without space selected
- ✅ Verify conversation is linked to space after completion

---

## DEPLOYMENT CHECKLIST

### Database
- ✅ Migration applied: `20251117_spaces_mvp_updated.sql`
- [ ] Storage bucket `chat-uploads` created and set to PRIVATE
- [ ] Storage RLS policies applied (via Dashboard)

### Edge Function
- [ ] Deploy updated `ai-chat-router` function with:
  - RLS-enabled Supabase client
  - Space context injection
  - Signed URL image handling
  - SSE streaming response

### Frontend
- [ ] Install `@microsoft/fetch-event-source`
- [ ] Update chat hook to use SSE streaming
- [ ] Wire space selector to chat interface
- [ ] Update image upload to use private storage + signed URLs

### Environment Variables
- [ ] Verify `OPENAI_API_KEY` is set in Edge Function environment
- [ ] Verify Supabase URL and keys are correctly configured

---

## SUCCESS METRICS (5-Day Validation)

1. **Adoption:** % of users who create at least one space
2. **Engagement:** Average messages sent per space vs. without space
3. **Context Quality:** User feedback on AI responses with space context
4. **Security:** Zero RLS violations or unauthorized access attempts

---

## WHAT WE CUT (And Why)

| Feature | Reason for Cut | Can Add Later? |
|---------|---------------|----------------|
| RAG (Vector Search) | Complex, not essential for MVP | Yes (Phase 2) |
| Zustand | Simple useState sufficient | Yes (if state grows) |
| RHF/Zod | Basic validation sufficient | Yes (for complex forms) |
| Image Compression | Not essential, adds complexity | Yes (for optimization) |
| PostHog | Simple DB analytics sufficient | Yes (for advanced analytics) |
| Real-time Subscriptions | Refetch on action sufficient | Yes (for collaboration) |
| Combobox (fancy select) | Basic select sufficient | Yes (for UX polish) |

---

## WHAT WE KEPT (And Why)

| Feature | Reason | Non-Negotiable? |
|---------|--------|-----------------|
| RLS | Security is essential | YES |
| Streaming (SSE) | Core UX expectation | YES |
| Signed URLs | Security for private images | YES |
| System Prompt | Core feature value | YES |
| Simple Context (Top 3) | Validates hypothesis | YES |

---

## NEXT STEPS AFTER MVP

**If validation succeeds:**
1. Implement RAG for smarter context retrieval
2. Add real-time collaboration features
3. Enhance analytics with PostHog or similar
4. Add image compression for performance
5. Implement advanced forms with RHF/Zod
6. Add global state management with Zustand

**If validation fails:**
- Analyze which aspect didn't work (context quality, UX, adoption)
- Pivot or iterate based on learnings
- Low cost due to ruthless cuts
