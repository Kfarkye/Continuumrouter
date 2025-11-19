# Critical Stability Fixes

## Overview

Two critical issues have been identified that can cause instability in production:

1. **Unhandled Promise Rejections** in memory retrieval timeout
2. **Virtualization warnings** from rapid message height changes

---

## ⚠️ Issue #1: Memory Retrieval Timeout Instability

### The Problem

```typescript
// CURRENT CODE (UNSTABLE):
const memoryPromise = retrieveMemories(content, accessToken, projectId);
const timeoutPromise = new Promise<Memory[]>((_, reject) =>
    setTimeout(() => reject(new Error("Memory retrieval timed out")), 5000)
);

relevantMemories = await Promise.race([memoryPromise, timeoutPromise]);
```

**What Happens:**
1. Timeout wins the race after 5s
2. Code catches the timeout error and continues
3. **But**: `memoryPromise` continues running in background
4. If `memoryPromise` eventually fails → **Unhandled Promise Rejection**
5. This can crash Node.js processes or cause instability

### The Fix

```typescript
// FIXED CODE (STABLE):
const memoryPromise = retrieveMemories(content, accessToken, projectId);
let timeoutId: ReturnType<typeof setTimeout> | null = null;

// Create a timeout promise
const timeoutPromise = new Promise<Memory[]>((_, reject) => {
    timeoutId = setTimeout(() => {
        reject(new Error("Memory retrieval timed out"));
    }, CONFIG.MEMORY_RETRIEVAL_TIMEOUT_MS);
});

// FIX: Handle potential eventual rejection of memoryPromise if it loses the race.
// This prevents "unhandled promise rejection" errors if the timeout wins and
// the memoryPromise later fails in the background.
memoryPromise.catch((err) => {
    // We log this for debugging, but the flow is already handled by the race winner.
    console.debug("Background memory retrieval eventually failed (non-blocking):", err);
});

// Race the memory retrieval against the timeout
try {
    relevantMemories = await Promise.race([
        memoryPromise,
        timeoutPromise
    ]);
} finally {
    // Ensure the timeout is always cleared, preventing resource leaks.
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
}
```

**Key Improvements:**
1. ✅ `.catch()` on `memoryPromise` handles background failures
2. ✅ `timeoutId` stored and cleared in `finally` block
3. ✅ Prevents resource leaks
4. ✅ No unhandled promise rejections

---

## ⚠️ Issue #2: Virtualization Performance Warnings

### The Problem

```
Warning: Measure loop restarted more than 5 times
```

**What Causes This:**
- Message heights change rapidly during streaming
- Virtualizer recalculates layout repeatedly
- Low `estimateSize` (150px) causes more recalculations

### The Fix

```typescript
// BEFORE (UNSTABLE):
const virtualizer = useVirtualizer({
    count: reversedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150, // Too low!
    overscan: 10,
    reverse: true,
});

// AFTER (STABLE):
const virtualizer = useVirtualizer({
    count: reversedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 250, // Increased for stability
    overscan: 10,
    reverse: true,
});
```

**Why This Works:**
- Higher estimate reduces recalculation frequency
- Still accurate enough for most messages
- Virtualizer stabilizes faster

---

## 📝 Implementation Steps

### Step 1: Fix Memory Retrieval (useAiRouterChat.ts)

**Location:** `src/hooks/useAiRouterChat.ts` around line 271

**Find this section:**
```typescript
const memoryPromise = retrieveMemories(content, accessToken, projectId);
// Create a timeout promise
const timeoutPromise = new Promise<Memory[]>((_, reject) =>
    setTimeout(() => reject(new Error("Memory retrieval timed out")), CONFIG.MEMORY_RETRIEVAL_TIMEOUT_MS)
);

// Race the memory retrieval against the timeout
relevantMemories = await Promise.race([memoryPromise, timeoutPromise]);
```

**Replace with:**
```typescript
const memoryPromise = retrieveMemories(content, accessToken, projectId);
let timeoutId: ReturnType<typeof setTimeout> | null = null;

// Create a timeout promise
const timeoutPromise = new Promise<Memory[]>((_, reject) => {
    timeoutId = setTimeout(() => {
        reject(new Error("Memory retrieval timed out"));
    }, CONFIG.MEMORY_RETRIEVAL_TIMEOUT_MS);
});

// FIX: Handle potential eventual rejection of memoryPromise if it loses the race.
// This prevents "unhandled promise rejection" errors if the timeout wins and
// the memoryPromise later fails in the background.
memoryPromise.catch((err) => {
    // We log this for debugging, but the flow is already handled by the race winner.
    console.debug("Background memory retrieval eventually failed (non-blocking):", err);
});

// Race the memory retrieval against the timeout
try {
    relevantMemories = await Promise.race([
        memoryPromise,
        timeoutPromise
    ]);
} finally {
    // Ensure the timeout is always cleared, preventing resource leaks.
    if (timeoutId) {
        clearTimeout(timeoutId);
    }
}
```

**Also update the catch block (around line 284):**
```typescript
// FROM:
console.warn('Memory retrieval failed or timed out, continuing without memories:', err);

// TO:
// This catches if the timeout won the race, or if retrieveMemories() failed quickly.
// We log this as informational (downgraded from warn) and continue resiliently.
console.info('Memory retrieval failed or timed out, continuing without memories:', (err as Error)?.message);
```

### Step 2: Fix Virtualization (MessageList.tsx)

**Location:** `src/components/MessageList.tsx` in the `useVirtualizer` call

**Find:**
```typescript
const virtualizer = useVirtualizer<ScrollContainer, VirtualItemElement>({
    count: reversedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150,
    overscan: 10,
    reverse: true,
});
```

**Change to:**
```typescript
const virtualizer = useVirtualizer<ScrollContainer, VirtualItemElement>({
    count: reversedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    // ADJUSTMENT: Increased estimateSize from 150 to 250 to improve virtualization stability
    // and reduce "Measure loop restarted" warnings during rapid updates.
    estimateSize: () => 250,
    overscan: 10,
    reverse: true,
});
```

---

## ✅ Verification

### Test Memory Fix:
1. Send a message while memory service is slow/offline
2. Check console - should see:
   - **No** "UnhandledPromiseRejectionWarning"
   - **Yes** `console.info` message (not `warn`)
   - **Optional** `console.debug` if background failure occurs

### Test Virtualization Fix:
1. Send multiple messages rapidly
2. Let AI stream long responses
3. Check console - should see:
   - **Fewer** or **no** "Measure loop restarted" warnings
   - Smooth scrolling behavior

---

## 🎯 Impact

### Before Fixes:
- ❌ Unhandled promise rejections (potential crashes)
- ❌ Memory leaks from uncancelled timeouts
- ❌ Virtualization warnings during streaming
- ❌ Potential instability in production

### After Fixes:
- ✅ All promises properly handled
- ✅ Timers properly cleaned up
- ✅ Stable virtualization
- ✅ Production-ready stability

---

## 📚 Technical Details

### Promise.race() Pitfall

When using `Promise.race()`, **all promises continue running** even after one wins:

```typescript
// ❌ WRONG - Loses track of losing promises
const result = await Promise.race([promise1, promise2]);
// If promise2 wins but promise1 later rejects → UNHANDLED REJECTION

// ✅ CORRECT - Handle all promises
promise1.catch(err => console.debug("Lost race, handled:", err));
promise2.catch(err => console.debug("Lost race, handled:", err));
const result = await Promise.race([promise1, promise2]);
```

### setTimeout() Cleanup

Always clear timeouts to prevent:
1. **Memory leaks** - Timer holds references
2. **Unexpected behavior** - Timer fires after component unmounts
3. **Resource waste** - Unnecessary timers running

```typescript
// ✅ CORRECT pattern
let timeoutId: ReturnType<typeof setTimeout> | null = null;
try {
    timeoutId = setTimeout(() => { /* ... */ }, 5000);
    // ... await something ...
} finally {
    if (timeoutId) clearTimeout(timeoutId);
}
```

---

## 🚀 Next Steps

1. Apply fixes to `useAiRouterChat.ts`
2. Apply fixes to `MessageList.tsx`
3. Test with slow/failing memory service
4. Test with rapid message streaming
5. Verify no console warnings
6. Deploy to production

**Priority:** **HIGH** - These are stability issues that can cause production failures.

---

## 📝 Notes

- The file `useAiRouterChat.ts` may have mixed whitespace (tabs/spaces)
- Use a code editor to ensure proper formatting
- Test thoroughly before deploying
- Monitor production logs for any remaining warnings

**Status:** Documented and ready for implementation
