# CRITICAL: sendMessage Implementation Missing

## 🚨 URGENT ISSUE

The `sendMessage` function in `useAiRouterChat.ts` is **90% missing**. Only placeholder comments exist where critical code should be.

### What's Missing

1. **Guards and Initialization** (lines 341-342) - Authentication checks, state setup
2. **Data Preparation** (lines 344-345) - User message, file attachments, assistant placeholder
3. **Request Headers** (line 384) - Authorization token, API key
4. **Request Body** (line 384) - Message content, files, images
5. **Stream Processing Loop** - Reading SSE stream, parsing chunks, updating UI

### Current State (BROKEN)
```typescript
const sendMessage = useCallback(
  async (content: string, attachedFileIds: string[], imageIds: string[] = []) => {
    // 1. Guards and Initialization
    // ... (Guards and Initialization remain the same)

    // 2. Prepare Data and Optimistic UI Update
    // ... (Preparation and Optimistic Update remain the same)

    // 3. Network Request and Stream Processing
    try {
      // ... missing 200+ lines of code ...

      const response = await fetchWithRetry(
        AI_ROUTER_FUNCTION_URL,
        {
          // ... (Request options remain the same)  <-- MISSING!
        },
        CONFIG.RETRY_COUNT,
        CONFIG.RETRY_BASE_DELAY_MS
      );
```

### Impact
- ❌ **Cannot send messages** - Request has no headers or body
- ❌ **401 Unauthorized** - No auth token sent
- ❌ **No streaming** - Stream processing loop missing
- ❌ **App unusable** - Core functionality broken

---

## Quick Fix: Restore Complete Implementation

The `useAiRouterChat.ts` file needs to be completely rewritten. The placeholder comments indicate this was documentation scaffolding that was never filled in.

### Required Sections

#### Section 1: Guards (lines ~341-355)
```typescript
// 1. Guards and Initialization
if (!sessionId) {
  setError({ code: 'NO_SESSION', message: 'Session ID is required.' });
  return;
}
if (isSendingRef.current) {
  console.warn("Message already in flight. Ignoring request.");
  return;
}
if (!accessToken || !userId) {
  setError({ code: 'AUTH_REQUIRED', message: 'Authentication required.' });
  return;
}

setError(null);
setIsSending(true);
assistantTextAccRef.current.clear();
assistantMessageIdRef.current = null;
assistantMetadataRef.current = {};
assistantStatusRef.current = 'streaming';
assistantProgressRef.current = 0;
assistantStepRef.current = '';
setCurrentProgress(0);
setCurrentStep('');
```

#### Section 2: Data Preparation (lines ~357-400)
```typescript
// 2. Prepare Data and Optimistic UI Update
const timestamp = new Date();
const userMessageId = crypto.randomUUID();

const fileAttachments: FileAttachment[] = attachedFileIds
  .map((id) => {
    const f = filesById.get(id);
    if (!f) return null;
    return {
      id: f.id,
      name: f.file_name,
      type: f.file_type,
      url: f.file_url || '',
      size: f.file_size,
    };
  })
  .filter((f): f is FileAttachment => f !== null);

const userMessage: ChatMessage = {
  id: userMessageId,
  role: 'user',
  content,
  timestamp,
  status: 'complete',
  metadata: {
    attachedFileIds,
    attachedImageIds: imageIds.length > 0 ? imageIds : undefined,
  },
};

const assistantId = crypto.randomUUID();
assistantMessageIdRef.current = assistantId;

const assistantPlaceholder: ChatMessage = {
  id: assistantId,
  role: 'assistant',
  content: '',
  timestamp: new Date(),
  status: 'streaming',
  progress: 0,
  metadata: {},
};

setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
```

#### Section 3: Request Headers & Body (lines ~381-395)
```typescript
const response = await fetchWithRetry(
  AI_ROUTER_FUNCTION_URL,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      sessionId,
      userMessage: content,
      attachedFiles: fileAttachments,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      providerHint,
      userId,
      memories: relevantMemories.length > 0 ? relevantMemories : undefined
    }),
    keepalive: true,
    signal: abortControllerRef.current.signal,
  },
  CONFIG.RETRY_COUNT,
  CONFIG.RETRY_BASE_DELAY_MS
);
```

#### Section 4: Stream Processing Loop (lines ~400-470)
```typescript
if (!response.body) throw new Error('No response body received.');

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const lines = buffer.split('\\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const parsed = parseLineToChunk(line);
      if (!parsed) continue;

      if (parsed.type === 'done') {
        assistantStatusRef.current = 'complete';
        scheduleAssistantCommit();
        continue;
      }

      if (parsed.type === 'text') {
        assistantTextAccRef.current.append(parsed.content);
        scheduleAssistantCommit();
      }

      if (parsed.type === 'progress') {
        assistantProgressRef.current = parsed.progress;
        assistantStepRef.current = parsed.step;
        scheduleAssistantCommit();
      }

      if (parsed.type === 'model_switch') {
        assistantMetadataRef.current = {
          ...assistantMetadataRef.current,
          model: parsed.model,
          ...(parsed.metadata || {}),
        };
        if (parsed.content) {
          assistantTextAccRef.current.append(parsed.content);
        }
        scheduleAssistantCommit();
      }

      if (parsed.type === 'metadata') {
        assistantMetadataRef.current = {
          ...assistantMetadataRef.current,
          ...parsed.content,
        };
        scheduleAssistantCommit();
      }

      if (parsed.type === 'action_request' && onActionRequestRef.current) {
        try {
          await onActionRequestRef.current(parsed.action, parsed.content);
        } catch (actionErr) {
          console.error('Action request failed:', actionErr);
        }
      }

      if (parsed.type === 'error') {
        assistantStatusRef.current = 'error';
        assistantTextAccRef.current.append(
          `\\n\\n❌ Error: ${JSON.stringify(parsed.content)}`
        );
        scheduleAssistantCommit();
      }
    }
  }
} finally {
  reader.releaseLock();
}

assistantStatusRef.current = 'complete';
scheduleAssistantCommit();
setIsSending(false);
```

---

## Solution

Due to the complexity and the file's mixed whitespace issues, the best solution is:

1. **Backup current file**
2. **Rewrite from scratch** using a working reference
3. **Test thoroughly**

The file is fundamentally broken with 200+ lines of missing implementation.

---

## Immediate Action Required

**This is not a minor bug - the entire chat send functionality is non-functional.**

Without this fix:
- Users cannot send messages
- Chat interface is completely broken
- 401 errors will persist
- No streaming will work

**Priority: CRITICAL**
**Estimated Fix Time: 15-20 minutes for complete rewrite**

---

## Why This Happened

The file appears to be from documentation/scaffolding phase where placeholder comments were used to indicate "implementation goes here" but the actual code was never written or was accidentally removed during editing.

This is evident from comments like:
```typescript
// ... (Guards and Initialization remain the same)
// ... (Preparation and Optimistic Update remain the same)
// ... (Request options remain the same)
```

These should have been replaced with actual code.
