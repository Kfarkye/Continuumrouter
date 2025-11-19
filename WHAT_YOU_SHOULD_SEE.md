# What You Should See - Streaming Cursor Behavior

## ✅ CORRECT Behavior

### During Streaming (While AI is Typing)
**In the UI:**
- You should see a **blue animated vertical bar** (|) that pulses gently
- The cursor should appear at the END of the content as it's being generated
- The cursor might appear inside code blocks at the end of the code being generated
- You should see "Generating..." text next to some cursors

**In the Console:**
```
🟣 [MessageBubble] Adding cursor to streaming content: { ... }
🟢 [MessageBubble] Text node with cursor: { tokenCount: 1 }
```

### After Streaming Completes
**In the UI:**
- The animated cursor should **disappear completely**
- Only the message content should remain
- No token text should be visible anywhere

**In the Console:**
```
⚪ [MessageBubble] Using sanitized content (no cursor, not streaming)
🟡 [MessageBubble] Sanitizing content: { tokensRemoved: 1, stillHasToken: false }
```

---

## ❌ INCORRECT Behavior (What We're Debugging)

### Problem: Token Visible as Text

**What you might see in UI:**
- The literal text `🔴CURSOR🔴` appearing in the message
- OR just `🔴` appearing in weird places
- OR previously ` <STREAMING_CURSOR>` appearing in text/code

**What happens:**
- A **MASSIVE PULSING RED BANNER** will appear above the message
- The banner says: `🚨🚨🚨 TOKEN DETECTED IN CONTENT 🚨🚨🚨`
- The banner shows exactly where the token is (contentWithCursor vs sanitizedContent)
- The banner shows the last 200 characters of both content variables

**In the Console:**
You'll see color-coded logs showing WHERE the token got through:
- 🔴 if partial token leaked
- 🔵 if token survived code block cleaning
- 🟡 if token survived sanitization

---

## 🔍 Quick Visual Test

### Test 1: Start a Conversation
1. Type a message to the AI
2. As the AI responds, watch the END of the text
3. **EXPECTED:** Blue pulsing vertical bar (|)
4. **BAD:** The text `🔴CURSOR🔴` or red circle emoji

### Test 2: Wait for Response to Complete
1. Let the AI finish its response
2. **EXPECTED:** No cursor visible at all
3. **BAD:** Token text remains, or red banner appears

### Test 3: Ask for Code
1. Ask AI: "Write a simple JavaScript function"
2. Watch as code appears in a code block
3. **EXPECTED:** Blue cursor at the end of code while streaming, then disappears
4. **BAD:** Token text appears inside the code block

---

## 📊 Debug Banner Explained

If you see this banner:

```
┌────────────────────────────────────────────────────┐
│ 🚨🚨🚨 TOKEN DETECTED IN CONTENT 🚨🚨🚨          │
│                                                    │
│ contentWithCursor has token: YES ❌               │
│ contentWithCursor has red circle: YES ❌          │
│ sanitizedContent has token: NO ✓                  │
│ sanitizedContent has red circle: NO ✓             │
│ isStreaming: YES                                   │
│ isAssistant: YES                                   │
│ message.id: msg_123                                │
│                                                    │
│ Last 200 chars of contentWithCursor:              │
│ ...some text here🔴CURSOR🔴                       │
│                                                    │
│ Last 200 chars of sanitizedContent:               │
│ ...some text here                                  │
└────────────────────────────────────────────────────┘
```

**This tells you:**
- ✅ `sanitizedContent` is clean (good!)
- ❌ `contentWithCursor` has the token (expected during streaming)
- 📍 The last 200 chars show you exactly where the token is

**If BOTH have the token:**
```
contentWithCursor has token: YES ❌
sanitizedContent has token: YES ❌  ← THIS IS THE PROBLEM!
```
This means the sanitization is failing. Check console for 🟡 logs.

---

## 🎯 What to Look For

### Streaming Cursor Component (GOOD)
The streaming cursor is a **React component** that renders as a styled `<span>`:
- Styled as a thin vertical blue bar
- Animated with opacity pulse
- Height matches font size
- Has `aria-label="Generating content"`

### Token Text (BAD)
If you see the actual characters:
- `🔴CURSOR🔴` - Full token visible
- `🔴` or `🔴🔴` - Partial token
- Previously ` <STREAMING_CURSOR>` - Old token format

This means the token is NOT being:
- Split properly by the text renderer
- Cleaned properly by the code renderer
- Removed by sanitization

---

## 💡 Quick Diagnosis

### See Blue Cursor?
✅ **Everything is working correctly!**

### See `🔴CURSOR🔴` Text?
❌ **Problem confirmed. Check console for:**
- 🔵 logs (code block issue)
- 🟢 logs (text node issue)
- 🟡 logs (sanitization issue)

### See Pulsing Red Banner?
⚠️ **Debug mode active. Banner shows:**
- Which variable has the problem
- Last 200 chars to see context
- All current state flags

### See Nothing (No Cursor, No Token)?
Check if:
- Message is still streaming (`isStreaming: true`)
- Message is from assistant (`isAssistant: true`)
If both true but no cursor, check ⚪ console logs

---

## 🔧 Expected Console Patterns

### Pattern 1: Normal Streaming Message
```
🟣 Adding cursor to streaming content
🟠 Paragraph renderer called (multiple times)
🟢 Text node with cursor: { tokenCount: 1 }
```

### Pattern 2: Message with Code Block
```
🟣 Adding cursor to streaming content
🟠 Paragraph renderer called
🔵 Code block with cursor: { stillHasToken: false }
```

### Pattern 3: Completed Message
```
⚪ Using sanitized content (not streaming)
🟡 Sanitizing content: { tokensRemoved: 1, stillHasToken: false }
🟠 Paragraph renderer called
```

### Pattern 4: ERROR - Token Leaked
```
🔵 Code block with cursor: { stillHasToken: true } ← BAD!
🔴 RED CIRCLE EMOJI DETECTED ← VERY BAD!
```

---

## Summary

**You should ONLY see:**
1. Blue animated cursor component (during streaming)
2. No cursor (after completion)
3. NEVER the token text itself

**If you see the token text:**
1. Red pulsing banner will alert you
2. Console logs will pinpoint the issue
3. Follow the debug guide (CURSOR_TOKEN_DEBUG_V2.md)

The new token (`🔴CURSOR🔴`) is designed to be **impossible to miss** if it leaks through to the UI.
