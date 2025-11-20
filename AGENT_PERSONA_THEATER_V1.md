# Agent Persona Theater v1 - Implementation Summary

## Overview
Implemented routing transparency UX that shows users which agent is handling their request, without adding heavy infrastructure or letting the LLM fake routing decisions.

## What Was Implemented

### 1. Backend Router Enhancements

**File: `supabase/functions/ai-chat-router/index.ts`**

- **Extended `TaskRouteResult` interface** with agent metadata:
  - `agentName: string` - Human-readable agent name (e.g., "Code Assistant", "Vision Analyst")
  - `intentDetected: string` - Description of detected intent

- **Created `LANE_PERSONAS` map** with specialized system prompts for each lane:
  - **Code**: Senior software engineer persona focused on production-ready code
  - **Creative**: Creative writing assistant persona for storytelling
  - **Vision**: Visual analysis expert persona for image analysis
  - **General**: No persona override (uses base prompt)

- **Enhanced `decideRoute()` function**:
  - Added `requestId` parameter for debug logging
  - Returns `agentName` and `intentDetected` for all routing decisions
  - Added optional debug logging controlled by `DEBUG_ROUTING` env var
  - Expanded keyword detection for better classification:
    - Code: Added 'component', 'typescript', 'react'
    - Creative: Added 'narrative', 'character'

- **Injected lane personas into system prompts**:
  - Conditionally appends persona based on `taskType`
  - Preserves base system prompt (domain context)
  - Only applies persona if available for the lane

- **Added router decision SSE events**:
  - Emits `router_decision` event before streaming starts
  - Includes: `agent`, `intent`, `provider`, `model`
  - Maintains backward compatibility with existing `model_switch` event
  - Enhanced `model_switch` metadata with agent info

### 2. Frontend Enhancements

**File: `src/hooks/useAiRouterChat.ts`**

- **Extended `SSEMessage` type**:
  - Added `'router_decision'` to type union
  - Added `agent?: string` and `intent?: string` fields

- **Added router decision handler**:
  - Processes `router_decision` SSE events
  - Logs routing decisions to browser console in dev mode:
    ```
    🎭 Router Decision
    Agent: Code Assistant
    Intent: Programming task detected
    Model: anthropic/claude-sonnet-4-5-20250929
    ```
  - Injects 3 theater messages into chat:
    - `[System: Analysis complete. Intent: {intent}]`
    - `[System: Routing to {agent} ({model})...]`
    - `[Status: Connected]`

**File: `src/components/MessageBubble.tsx`**

- **Added system message rendering**:
  - Detects `message.role === 'system'`
  - Renders in center-aligned, monospace style
  - Subtle appearance: small text, muted color, transparent background
  - Smooth fade-in animation

### 3. Type Updates

**File: `src/types.ts`**

- System role already supported in `ChatMessage` interface
- No changes needed (already had `'system'` in role union)

## Architecture Decisions

### What We Did Right

1. **Router as Source of Truth**: All routing decisions happen in deterministic code, not LLM prompts
2. **Presentation Layer**: Theater messages are pure UI rendering of backend decisions
3. **No Hallucination Risk**: System messages come from structured backend events, not AI generation
4. **Zero Breaking Changes**: Maintained backward compatibility with existing flows
5. **Minimal Surface Area**: Added only essential features without premature infrastructure

### What We Deferred to v2

1. **AGENT_REGISTRY**: Wait for usage data to shape formal registry structure
2. **Confidence Scoring**: No fake numbers without real classifier
3. **Analytics Schema**: No new columns until we know what to track
4. **Feedback Loop**: Misrouting correction system (dev/staging only)
5. **Advanced Detection**: Keep simple keyword matching until patterns emerge

## Debugging Features

### Server-Side (Optional)

Set `DEBUG_ROUTING=true` environment variable to enable:
- Message analysis logging (length, image count)
- Matched route logging (taskType, agent, trigger keyword)
- Classification decision traces

### Client-Side (Automatic in Dev)

Browser console shows routing decisions automatically in development:
```
🎭 Router Decision
  Agent: Vision Analyst
  Intent: Image analysis request
  Model: anthropic/claude-sonnet-4-5-20250929
```

## Current Agent Lanes

1. **Vision Analyst**
   - Trigger: Images attached to message
   - Provider: Anthropic
   - Model: Claude Sonnet 4.5
   - Persona: Visual analysis expert

2. **Code Assistant**
   - Triggers: code, function, debug, implement, algorithm, error, bug, component, typescript, react
   - Provider: Anthropic
   - Model: Claude Sonnet 4.5
   - Persona: Senior software engineer

3. **Creative Writer**
   - Triggers: write, story, poem, creative, blog, narrative, character
   - Provider: OpenAI
   - Model: GPT-4
   - Persona: Creative writing assistant

4. **General Assistant**
   - Trigger: Fallback for all other queries
   - Provider: Gemini (default)
   - Persona: None (uses base system prompt)

## User Experience

When a user sends a message, they now see:

```
[System: Analysis complete. Intent: Programming task detected]
[System: Routing to Code Assistant (claude-sonnet-4-5-20250929)...]
[Status: Connected]

Then the AI's response begins...
```

These messages appear instantly before the AI starts streaming, providing transparency without interrupting the conversation flow.

## Benefits

1. **Transparency**: Users understand which specialized agent is handling their request
2. **Trust**: Clear communication about routing decisions builds confidence
3. **Debugging**: Developers can see routing decisions in console without backend access
4. **Flexibility**: Easy to add new agents or refine triggers based on usage data
5. **Performance**: No token waste on LLM-generated routing theater
6. **Reliability**: No risk of hallucinated or incorrect routing messages

## Testing

To test the implementation:

1. **Code Query**: Send "Write a function to sort an array"
   - Should route to Code Assistant
   - System messages should appear before response

2. **Creative Query**: Send "Write me a short story about a robot"
   - Should route to Creative Writer
   - System messages should show OpenAI model

3. **Image Query**: Upload an image and ask "What's in this image?"
   - Should route to Vision Analyst
   - System messages should show image analysis intent

4. **General Query**: Send "What's the weather like?"
   - Should route to General Assistant
   - System messages should show general conversation

5. **Console Logging**: Open DevTools in development
   - Each query should log routing decision to console
   - Should show agent, intent, and model info

## Configuration

### Enable Debug Logging

Set environment variable in your Supabase edge function:
```bash
DEBUG_ROUTING=true
```

This will log detailed classification information for tuning triggers.

### Customize Personas

Edit `LANE_PERSONAS` in `supabase/functions/ai-chat-router/index.ts`:
```typescript
const LANE_PERSONAS: Record<string, string> = {
  code: "Your custom code assistant persona...",
  creative: "Your custom creative writer persona...",
  vision: "Your custom vision analyst persona...",
  general: "", // Empty = no persona override
};
```

### Add New Agent Lanes

1. Add new route detection in `decideRoute()`:
```typescript
const sportsWords = ['odds', 'bet', 'spread', 'parlay'];
if (sportsWords.some(word => userText.includes(word))) {
  const profile = ROUTER_CONFIG['anthropic'];
  const result = {
    taskType: 'sports',
    profile,
    reasoning: 'Sports betting analysis.',
    agentName: 'Sports Intelligence',
    intentDetected: 'Sports betting query detected'
  };
  return result;
}
```

2. Add persona to `LANE_PERSONAS`:
```typescript
const LANE_PERSONAS: Record<string, string> = {
  // ... existing personas
  sports: "You are a sports betting analyst. Provide data-driven insights on odds, line movements, and value bets.",
};
```

## Next Steps (v2)

1. **Collect Usage Data**: Monitor which lanes get most traffic
2. **Refine Triggers**: Adjust keyword matching based on misrouting patterns
3. **Add Feedback Loop**: Let users correct bad routing decisions (dev/staging only)
4. **Analytics Integration**: Track agent usage and performance metrics
5. **Confidence Scoring**: Add probabilistic routing when patterns are clear
6. **Advanced Detection**: Consider ML-based intent classification if keyword matching proves insufficient

## Files Changed

- `supabase/functions/ai-chat-router/index.ts` - Router logic and personas
- `src/hooks/useAiRouterChat.ts` - SSE event handling and theater message injection
- `src/components/MessageBubble.tsx` - System message rendering
- `src/types.ts` - No changes needed (system role already supported)

## Deployment Notes

- No database migrations required
- No breaking changes to existing API
- Backward compatible with all existing clients
- Can be rolled out gradually with feature flag if desired

---

**Status**: ✅ Complete and tested
**Build**: ✅ Passing
**Breaking Changes**: None