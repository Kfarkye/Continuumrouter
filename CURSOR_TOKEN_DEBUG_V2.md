# 🔴 Streaming Cursor Token - Ultra Debug Mode

## 🚨 MAJOR CHANGES - V2 🚨

### New Token Format
**The token is now IMPOSSIBLE to miss:**
```
🔴CURSOR🔴
```

If you see this ANYWHERE in the UI, you'll immediately know something is wrong. The red circle emojis make it visually distinctive.

## 🎯 What Will Happen Now

### 1. **Massive Visual Alert**
If the token appears in content about to be rendered, you'll see a **PULSING RED BANNER** at the top of the message that says:

```
🚨🚨🚨 TOKEN DETECTED IN CONTENT 🚨🚨🚨
```

This banner shows:
- Whether `contentWithCursor` has the token ✅ or ❌
- Whether `contentWithCursor` has red circle emoji 🔴
- Whether `sanitizedContent` has the token ✅ or ❌
- Whether `sanitizedContent` has red circle emoji 🔴
- Current streaming status
- Message ID
- Last 200 characters of BOTH content variables

### 2. **Color-Coded Console Logging**
Every step of the token lifecycle is now logged with emoji prefixes for easy filtering:

#### 🟡 Sanitization (`sanitizedContent` memo)
Logs when content is being cleaned:
```javascript
🟡 [MessageBubble] Sanitizing content: {
  originalLength: number,
  originalFirst200: string,
  originalLast200: string,
  cleanedLength: number,
  cleanedFirst200: string,
  cleanedLast200: string,
  hadToken: boolean,
  tokensRemoved: number,
  stillHasToken: boolean  // ⚠️ This should ALWAYS be false!
}
```

#### 🟣 Adding Cursor (`contentWithCursor` memo)
Logs when adding cursor to streaming content:
```javascript
🟣 [MessageBubble] Adding cursor to streaming content: {
  messageId: string,
  originalLength: number,
  withCursorLength: number,
  last100Chars: string,
  addedToken: '🔴CURSOR🔴',
  resultLast100: string  // Should end with 🔴CURSOR🔴
}
```

#### ⚪ Using Sanitized Content
Logs when NOT streaming (should have no token):
```javascript
⚪ [MessageBubble] Using sanitized content (no cursor, not streaming): {
  messageId: string,
  isStreaming: false,
  isAssistant: boolean,
  contentLength: number
}
```

#### 🟠 Paragraph Renderer
Logs every time a paragraph is rendered:
```javascript
🟠 [MessageBubble] Paragraph renderer called: {
  childrenCount: number,
  hasBlockLevelChild: boolean
}
```

#### 🔵 Code Block with Cursor
Logs when rendering a code block that had the cursor token:
```javascript
🔵 [MessageBubble] Code block with cursor: {
  inline: boolean,
  language: string,
  rawTextLength: number,
  rawTextFirst100: string,
  rawTextLast100: string,
  cleanTextFirst100: string,
  cleanTextLast100: string,
  stillHasToken: boolean,  // ⚠️ This should ALWAYS be false!
  tokenInRaw: boolean
}
```

#### 🟢 Text Node with Cursor
Logs when rendering a text node that contains the cursor:
```javascript
🟢 [MessageBubble] Text node with cursor: {
  valueLength: number,
  value: string,  // Full text content
  tokenCount: number,
  splitParts: number  // How many parts after splitting
}
```

#### 🔴 RED ALERT - Partial Token Detected
If just the red circle emoji appears without the full token:
```javascript
🔴 [MessageBubble] RED CIRCLE EMOJI DETECTED IN TEXT NODE: {
  value: string,
  containsFullToken: boolean
}
```

## 🔍 How to Debug

### Step 1: Open Your App
1. Navigate to the chat interface
2. Start a conversation with the AI
3. Open Browser DevTools (F12)
4. Go to the Console tab

### Step 2: Watch for the Visual Alert
If you see the **PULSING RED BANNER** in the UI:
- Take a screenshot immediately
- Note which variable has the token
- Check the last 200 characters shown in the banner

### Step 3: Check Console Logs
Filter console by emoji or `[MessageBubble]`:
- Look for the color-coded emoji prefixes
- Follow the token through its lifecycle
- Identify where it's NOT being cleaned properly

### Step 4: Trace the Token Path

**Normal Streaming Flow:**
```
1. 🟣 Adding cursor → contentWithCursor ends with 🔴CURSOR🔴
2. 🟡 Sanitizing → sanitizedContent should NOT have token
3. 🟢 Text node OR 🔵 Code block → Should render StreamingCursor component
4. ✅ User sees animated cursor, NOT the token text
```

**If Token Appears in UI:**
```
❌ Something in step 3 failed
   → Check 🔵 log: Does `stillHasToken: true`? = Regex didn't work
   → Check 🟢 log: Is token not being split? = Text renderer not catching it
   → Check 🔴 log: Partial token leak? = Encoding issue
```

## 🎯 Expected Console Output

### During Active Streaming:
```
🟣 [MessageBubble] Adding cursor to streaming content: { ... }
🟠 [MessageBubble] Paragraph renderer called: { ... }
🟢 [MessageBubble] Text node with cursor: { tokenCount: 1, ... }
```

### When Message Completes:
```
⚪ [MessageBubble] Using sanitized content (no cursor, not streaming): { ... }
🟡 [MessageBubble] Sanitizing content: { tokensRemoved: 1, stillHasToken: false }
🟠 [MessageBubble] Paragraph renderer called: { ... }
```

## ⚠️ Red Flags

### 🚩 Red Flag #1: Token in Sanitized Content
```javascript
🟡 [MessageBubble] Sanitizing content: {
  stillHasToken: true  // ❌ THIS IS BAD!
}
```
**Meaning:** The regex replacement failed
**Fix needed:** Check if the token format matches exactly

### 🚩 Red Flag #2: Token Survives Code Block Cleaning
```javascript
🔵 [MessageBubble] Code block with cursor: {
  stillHasToken: true  // ❌ THIS IS BAD!
}
```
**Meaning:** The token is in the code block but not being removed
**Fix needed:** Regex not matching inside code blocks

### 🚩 Red Flag #3: No Text Node Log But Token Visible
**Meaning:** Token is appearing but not going through the text renderer
**Fix needed:** Token might be in a different rendering path (e.g., inside HTML attributes)

### 🚩 Red Flag #4: Partial Token (Red Circle Only)
```javascript
🔴 [MessageBubble] RED CIRCLE EMOJI DETECTED IN TEXT NODE: {
  containsFullToken: false  // ❌ Partial token!
}
```
**Meaning:** The token is being partially removed or mangled
**Fix needed:** Encoding issue or incorrect string manipulation

## 📝 What to Report

If the token still appears after all this debugging, provide:

1. **Screenshot of the PULSING RED BANNER**
2. **Full console log** from DevTools (copy all `[MessageBubble]` entries)
3. **Which emoji logs appeared** (🟡🟣⚪🟠🔵🟢🔴)
4. **Value of `stillHasToken`** from any 🔵 or 🟡 logs
5. **The actual message content** that triggered the issue (if possible)

## 🎨 Visual Identification

If you see **🔴CURSOR🔴** as actual text anywhere:
- In message text
- In code blocks
- In any rendered content

You'll IMMEDIATELY see the pulsing red banner AND get detailed console logs explaining exactly where in the rendering pipeline the token is.

The emoji-based token makes it **impossible to overlook** and the color-coded logs make it **easy to trace** exactly where the problem is occurring.
