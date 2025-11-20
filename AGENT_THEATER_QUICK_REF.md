# Agent Theater Quick Reference

## What You'll See

When you send a message, the system now shows which agent is handling your request:

```
[System: Analysis complete. Intent: Programming task detected]
[System: Routing to Code Assistant (claude-sonnet-4-5-20250929)...]
[Status: Connected]

<AI response starts here>
```

## Current Agents

| Agent | Triggers | Provider | Use Case |
|-------|----------|----------|----------|
| **Vision Analyst** | Images attached | Anthropic Claude | Image analysis, visual Q&A |
| **Code Assistant** | code, function, debug, component, react | Anthropic Claude | Programming, debugging |
| **Creative Writer** | write, story, poem, narrative, character | OpenAI GPT-4 | Creative writing, storytelling |
| **General Assistant** | Everything else | Google Gemini | General conversation |

## Debug in Browser

Open DevTools Console (F12) and you'll see:

```
🎭 Router Decision
  Agent: Code Assistant
  Intent: Programming task detected
  Model: anthropic/claude-sonnet-4-5-20250929
```

## How It Works

1. **You send a message** → Router analyzes keywords
2. **Router picks agent** → Based on trigger words
3. **Theater messages appear** → Shows routing decision
4. **Agent responds** → With specialized persona

## Key Principle

The router code decides everything. The AI never "pretends" to route. All system messages come from real backend decisions.

## Add New Agent (Example: Sports)

1. Edit `supabase/functions/ai-chat-router/index.ts`
2. Add detection logic:
```typescript
const sportsWords = ['odds', 'bet', 'spread', 'nba', 'nfl'];
if (sportsWords.some(word => userText.includes(word))) {
  return {
    taskType: 'sports',
    profile: ROUTER_CONFIG['anthropic'],
    reasoning: 'Sports betting query',
    agentName: 'Sports Intelligence',
    intentDetected: 'Sports betting analysis'
  };
}
```

3. Add persona:
```typescript
const LANE_PERSONAS = {
  sports: "You are a sports betting analyst...",
  // ... other personas
};
```

Done! Deploy and test.

## Troubleshooting

**Q: Theater messages not appearing?**
- Check browser console for routing decision
- Verify SSE connection is established
- Check network tab for `router_decision` event

**Q: Wrong agent selected?**
- Enable debug logging: `DEBUG_ROUTING=true`
- Check server logs for matched triggers
- Refine keyword detection in `decideRoute()`

**Q: Want to disable theater?**
- Comment out the theater message injection in `useAiRouterChat.ts`
- Or add a feature flag to conditionally show them

## Performance Notes

- Theater messages add ~3ms latency (negligible)
- No token waste (not LLM-generated)
- No hallucination risk (deterministic code)
- Backward compatible (existing clients unaffected)

---

**For detailed implementation, see:** `AGENT_PERSONA_THEATER_V1.md`
