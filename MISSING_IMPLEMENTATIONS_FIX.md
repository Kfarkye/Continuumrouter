# Critical Fix: Missing Hook Implementations

## 🚨 URGENT: Messages Not Loading

**Problem:** Two critical function implementations are missing from `useAiRouterChat.ts`:
1. `loadHistory` - Messages aren't loading from database
2. `scheduleAssistantCommit` - Streaming updates won't display

**Impact:** App is non-functional - no messages load, streaming doesn't work.

---

## Fix #1: Load History Implementation

**Location:** `src/hooks/useAiRouterChat.ts` line ~226

**Replace this:**
```typescript
  // Load history when sessionId changes (Simplified: Load Recent Subset)
  useEffect(() => {
    // ... (Implementation remains the same as the robust version provided in the prompt)
  }, [sessionId, isSendingRef, CONFIG.RECENT_MESSAGE_LIMIT]);
```

**With this:**
```typescript
  // Load history when sessionId changes (Simplified: Load Recent Subset)
  useEffect(() => {
    let cancelled = false;

    if (isSendingRef.current) {
        abortReasonRef.current = 'internal';
        abortControllerRef.current?.abort();
    }

    async function loadHistory(sid: string) {
      if (cancelled) return;
      setIsLoadingHistory(true);
      setMessages([]);
      setError(null);

      try {
        const { data: msgs, error: fetchErr } = await supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', sid)
          .order('created_at', { ascending: true })
          .limit(CONFIG.RECENT_MESSAGE_LIMIT);

        if (cancelled) return;

        if (fetchErr) {
          console.error('Failed to load message history:', fetchErr);
          setError({ code: 'HISTORY_LOAD_FAILED', message: 'Failed to load conversation history.' });
          setIsLoadingHistory(false);
          return;
        }

        const loaded: ChatMessage[] = (msgs || []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
          timestamp: new Date(m.created_at),
          status: 'complete',
          metadata: (m.metadata as Record<string, unknown>) || {},
        }));

        if (!cancelled) {
          setMessages(loaded);
          setIsLoadingHistory(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading history:', err);
          setError({ code: 'HISTORY_ERROR', message: 'An error occurred while loading history.' });
          setIsLoadingHistory(false);
        }
      }
    }

    if (sessionId) {
      loadHistory(sessionId);
    } else {
      setMessages([]);
      setIsLoadingHistory(false);
    }
    return () => { cancelled = true; };
  }, [sessionId, isSendingRef, CONFIG.RECENT_MESSAGE_LIMIT]);
```

---

## Fix #2: Schedule Assistant Commit Implementation

**Location:** `src/hooks/useAiRouterChat.ts` line ~231

**Replace this:**
```typescript
  // scheduleAssistantCommit (RAF batching)
  const scheduleAssistantCommit = useCallback(() => {
    // ... (Implementation remains the same as the robust version provided in the prompt)
  }, []);
```

**With this:**
```typescript
  // scheduleAssistantCommit (RAF batching)
  const scheduleAssistantCommit = useCallback(() => {
    if (rafIdRef.current != null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!mountedRef.current) return;

      const assistantId = assistantMessageIdRef.current;
      if (!assistantId) return;

      const content = assistantTextAccRef.current.value();
      const progress = assistantProgressRef.current;
      const step = assistantStepRef.current;
      const status = assistantStatusRef.current;
      const meta = assistantMetadataRef.current;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) return prev;
        const next = prev.slice();
        const currentMsg = next[idx];
        next[idx] = {
          ...currentMsg,
          content,
          status,
          progress,
          metadata: { ...meta },
        };
        return next;
      });
      setCurrentProgress(progress);
      setCurrentStep(step);
    });
  }, []);
```

---

## Fix #3: Clear Messages Implementation

**Location:** `src/hooks/useAiRouterChat.ts` line ~408

**Replace this:**
```typescript
  // clearMessages
  const clearMessages = useCallback(() => {
    // ... (Implementation remains the same)
  }, [cancelStream]);
```

**With this:**
```typescript
  // clearMessages
  const clearMessages = useCallback(() => {
    if (isSendingRef.current) {
      cancelStream('user');
    }
    setMessages([]);
    setError(null);
    setCurrentProgress(0);
    setCurrentStep('');
  }, [cancelStream, isSendingRef]);
```

---

## Quick Implementation Steps

1. **Open** `src/hooks/useAiRouterChat.ts` in your editor
2. **Find** line 226 (search for "Load history when sessionId")
3. **Replace** the placeholder comment with Fix #1 code
4. **Find** line 231 (search for "scheduleAssistantCommit")
5. **Replace** the placeholder comment with Fix #2 code
6. **Find** line 408 (search for "clearMessages")
7. **Replace** the placeholder comment with Fix #3 code
8. **Save** the file
9. **Test** - Messages should now load

---

## Verification

After applying fixes, test:

### Test 1: Loading Messages
1. Open app with existing conversation
2. Should see loading spinner
3. Messages should appear
4. ✅ **Pass:** Messages load
5. ❌ **Fail:** Empty screen or error

### Test 2: Sending Messages
1. Type and send a message
2. Should see streaming response
3. Cursor should blink during streaming
4. ✅ **Pass:** Response streams
5. ❌ **Fail:** Nothing happens or error

### Test 3: Clear Messages
1. Click clear messages button
2. Messages should disappear
3. ✅ **Pass:** Messages cleared
4. ❌ **Fail:** Error or messages remain

---

## Why This Happened

The comprehensive upgrade documentation included placeholder comments like:
```typescript
// ... (Implementation remains the same as the robust version provided in the prompt)
```

These were meant as markers during the documentation phase, but the actual implementations weren't restored.

**This is a critical bug** that makes the app non-functional.

---

## Priority

**CRITICAL** - Apply immediately. Without these implementations:
- ❌ Messages don't load from database
- ❌ Streaming doesn't display
- ❌ App is unusable

---

## After Applying Fixes

Run:
```bash
npm run build
```

Should build successfully with no errors.

Then test the app - messages should load and streaming should work.
