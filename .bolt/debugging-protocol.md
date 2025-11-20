# Debugging Protocol - MANDATORY

## When Chat/Streaming/Model Issues Occur

**NEVER immediately assume the model provider (Gemini, Claude, GPT) is broken.**

**ALWAYS follow this debugging sequence:**

### 1. Add Visibility First
- Add debug logs to see actual request payloads
- Log raw API responses (before parsing)
- Log parsing steps and transformations
- Log state changes and data flow

### 2. Check Data Contracts
- Does frontend payload match backend expectations?
- Are field names correct? (e.g., `messages` vs `userMessage`)
- Are data types matching?
- Is the API endpoint correct?

### 3. Read The Actual Error
- Don't assume - read what the system says
- Follow stack traces
- Check HTTP status codes and response bodies
- Look for validation errors

### 4. Fix Root Cause
- If payload mismatch → fix the payload structure
- If parsing fails → fix the parser logic
- If timeout → add proper timeout handling
- If integration broken → fix the integration

## What NOT To Do

❌ "Let's just switch to Claude/GPT"
❌ "Let's change the model routing logic"
❌ "Let's add a fallback to another model"
❌ Assume the external API is broken
❌ Work around issues without understanding them

## What TO Do

✅ Instrument the code with detailed logging
✅ Verify request/response contracts match
✅ Check the integration layer first
✅ Fix precisely, not broadly
✅ Test the actual fix

## Remember

**99% of "model issues" are actually integration issues:**
- Wrong payload format
- Mismatched field names
- Missing required fields
- Incorrect parsing logic
- Timeout/error handling bugs

**The model APIs themselves rarely break. Debug the integration first.**
