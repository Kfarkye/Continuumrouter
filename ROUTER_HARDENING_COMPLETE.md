# Router Hardening Complete - Phase 1: Flow Glue Implementation

## Overview

The AI Chat Router has been transformed from a simple multi-provider gateway into **intelligent "Flow Glue"** - a production-hardened system that provides stability, intelligence, transparency, and proper context management.

## What Was Implemented

### 1. Robust Stability and Persistence

**Conversation Integrity**
- Conversations are created/retrieved using `upsert` with `onConflict: 'session_id'` for robustness
- Handles race conditions and ensures conversation always exists before processing
- Returns proper 500 error if conversation establishment fails

**Immediate Message Persistence**
- User messages are saved to database **immediately** upon receipt, before LLM processing
- Creates audit trail even if LLM call fails
- Logs errors but continues to attempt response if user message save fails

**Structured Error Reporting**
- All provider streams classify errors into types:
  - `rate_limit` (429 status)
  - `authentication_error` (401/403 status)
  - `provider_outage` (500+ status)
  - `provider_error` (other failures)
- Errors are streamed to client via SSE with structured `errorType` field
- Client can display appropriate messaging and retry logic based on error classification

### 2. Intelligent Routing (Heuristic-Based Smart Routing)

**Task Classification System**
The router now analyzes incoming requests and classifies them into task types:

- `multimodal_analysis` - Requests with images
- `email_drafting` - Contains keywords: email, draft, template
- `analysis` - Contains keywords: analyze, compare, data
- `complex_reasoning` - Message length > 2500 characters
- `quick_task` - Contains keywords: quick, summary, summarize
- `general_assistance` - Everything else

**Model Selection Strategy**
Each task type is routed to the optimal model:

- **Multimodal Analysis** → GPT-4o (superior image understanding)
- **Email Drafting** → Claude Sonnet 3.5 (excellence in nuanced writing)
- **Complex Reasoning** → Claude Sonnet 3.5 (deep reasoning capabilities)
- **Analysis** → GPT-4o (analytical and structured output)
- **Quick Tasks** → Gemini Flash (fast and cost-effective)
- **General** → Claude Sonnet 3.5 (default, all-around excellence)

**User Override**
- `providerHint` parameter still respected for explicit user selection
- Provides taskType: 'override' when user manually selects provider

### 3. Structured Memory Injection

**External Brain Architecture**
Memories are now injected as structured XML with JSON artifacts:

```xml
<external_memory_artifacts>
  <description>The following JSON objects represent the externalized brain (previous decisions, plans, or artifacts) relevant to the current task. Use these to maintain continuity and inform your response.</description>
  <artifacts>
    [JSON array of memory objects]
  </artifacts>
</external_memory_artifacts>
```

**Benefits:**
- Clear demarcation using XML tags (excellent for Anthropic and GPT models)
- Structured JSON enables models to parse and utilize context more effectively
- Description provides explicit instructions for context utilization
- Maintains continuity across conversations through artifact references

### 4. Proof of Thought and Lineage Tracking

**Router Decision Streaming**
New SSE event type: `router_decision` sent before content stream starts:

```typescript
{
  type: 'router_decision',
  content: {
    taskType: 'email_drafting',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    reasoning: 'Classified task as email_drafting. Routing to Claude Sonnet 3.5 for its excellence in nuanced writing...',
    strengths: ['nuance', 'writing', 'email', 'reasoning', 'long-context', 'analysis']
  }
}
```

**Enhanced Message Persistence**
Assistant messages now include comprehensive metadata:

```typescript
{
  conversation_id: '...',
  role: 'assistant',
  content_text: '...',
  model: 'claude-3-5-sonnet-20241022',
  metadata: {
    router_decision: {
      task_classification: 'email_drafting',
      log: 'Classified task as...',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022'
    },
    lineage: {
      reply_to_message_id: 'uuid-of-user-message',
      context_used_ids: ['memory-1-id', 'memory-2-id']
    }
  }
}
```

**Lineage Benefits:**
- Track which user message each response replies to
- Record which memories/artifacts were used for context
- Enable "contextual breadcrumbs" for debugging
- Support future features like "why did you say this?" explanations

## Configuration

### Router Config
```typescript
const ROUTER_CONFIG = {
  MODEL_PROFILES: {
    'claude-sonnet-3.5': {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      strengths: ['nuance', 'writing', 'email', 'reasoning', 'long-context', 'analysis']
    },
    'gpt-4o': {
      provider: 'openai',
      model: 'gpt-4o',
      strengths: ['speed', 'logic', 'multimodal', 'analysis', 'structured-output']
    },
    'gemini-flash': {
      provider: 'gemini',
      model: 'gemini-2.0-flash-exp',
      strengths: ['speed', 'cost', 'summarization', 'quick-tasks']
    },
  },
  DEFAULT_MODEL: 'claude-sonnet-3.5'
};
```

**Easy to Update:**
- Change model versions in one place
- Add new models by extending MODEL_PROFILES
- Adjust task routing logic in `routeRequest()` function
- Model strengths documented for future optimization

## Client Integration

### Handling Router Decision Events

```typescript
const eventSource = new EventSource(chatRouterUrl);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'router_decision':
      // Display routing decision to user (optional)
      console.log(`Using ${data.content.model} for ${data.content.taskType}`);
      // Could show subtle UI indicator: "Optimized for email drafting"
      break;

    case 'text':
      // Handle streaming text as before
      appendToMessage(data.content);
      break;

    case 'error':
      // Handle structured errors
      handleError(data.errorType, data.content);
      break;

    case 'done':
      // Stream complete
      finalize();
      break;
  }
});
```

### Error Handling

```typescript
function handleError(errorType: string, message: string) {
  switch (errorType) {
    case 'rate_limit':
      showNotification('Rate limit reached. Please wait a moment and try again.');
      enableRetryAfter(60); // Retry after 1 minute
      break;

    case 'authentication_error':
      showNotification('Authentication failed. Please refresh and try again.');
      promptReauth();
      break;

    case 'provider_outage':
      showNotification('AI service temporarily unavailable. Switching to backup...');
      retryWithDifferentProvider();
      break;

    case 'provider_error':
    default:
      showNotification('An error occurred. Please try again.');
      enableRetry();
      break;
  }
}
```

## Benefits Delivered

### For Users (Reddit Subconscious Demands)
1. **Transparency**: Users see which model was selected and why
2. **Reliability**: Robust error handling prevents silent failures
3. **Intelligence**: Tasks are automatically routed to the best model
4. **Continuity**: Structured memory injection maintains context across sessions

### For Developers
1. **Debuggability**: Lineage tracking shows exactly what context was used
2. **Observability**: Router decisions logged for analysis and optimization
3. **Maintainability**: Centralized routing logic easy to update
4. **Scalability**: Classification system can be extended with ML-based routing

### For System Stability
1. **Data Integrity**: Messages persisted before processing
2. **Graceful Degradation**: Structured errors enable smart retry logic
3. **Audit Trail**: Full lineage from user message → context → response
4. **Session Management**: Robust conversation creation prevents orphaned messages

## Phase 2 Roadmap (30-60 Days)

The immediate hardening is complete. Next evolutionary steps:

### 1. Server-Side Memory Ownership
**Current:** Client passes `memories` array in request payload
**Future:** Router owns memory retrieval

```typescript
async function retrieveContext(userId: string, spaceId: string | null): Promise<Memory[]> {
  // Server-side RAG retrieval using vector search
  // No more client-managed memory passing
  // Survives client resets and refreshes
}
```

### 2. Selective Retrieval (RAG Evolution)
**Current:** All memories passed from client
**Future:** Vector-based selective retrieval

- Use pgvector for semantic search
- Retrieve only top-K most relevant artifacts per query
- Prevent context window bloat
- Enable much larger "external brain" storage

### 3. Artifact Extraction (Closing the Loop)
**Current:** Router processes and streams response only
**Future:** Post-processing artifact extraction

```typescript
async function extractArtifacts(response: string): Promise<Artifact[]> {
  // Analyze LLM output for structured artifacts
  // Extract: plans, decisions, code diffs, templates
  // Store as first-class objects in external memory
  // Link back to originating conversation
}
```

**Solves:** "Refactoring with amnesia" - system remembers its own changes

### 4. Multi-Model Continuity
**Current:** Single model per request
**Future:** Handoffs between models mid-workflow

- Route initial draft to Claude for writing
- Switch to GPT-4o for structured data extraction
- Use Gemini for quick summaries
- Maintain state across model transitions

## Testing Checklist

- [x] Conversation creation robustness (upsert handles conflicts)
- [x] User message persistence before LLM call
- [x] Structured error classification for all providers
- [x] Task classification accuracy (test all types)
- [x] Model selection logic (verify routing decisions)
- [x] Router decision streaming to client
- [x] Lineage tracking in saved messages
- [x] Structured memory injection format
- [x] Error recovery and retry flow
- [x] Provider-specific error handling (rate limits, outages, auth)

## Metrics to Monitor

### Router Intelligence
- Task classification distribution (are heuristics accurate?)
- Model selection patterns (which models used most?)
- User override frequency (do users trust routing?)

### Stability
- Message persistence success rate (should be 100%)
- Error type distribution (rate limits vs outages vs auth)
- Conversation establishment failures (should be near 0)

### Performance
- Router decision latency (<50ms overhead)
- Memory injection size impact on response time
- Lineage tracking storage growth

## Summary

**Phase 1 transforms the router from simple gateway to intelligent flow glue:**

1. **Predictable** - Robust conversation and message persistence
2. **Transparent** - Router decisions streamed to client
3. **Intelligent** - Heuristic-based task classification and routing
4. **Traceable** - Full lineage from input → context → output
5. **Resilient** - Structured error handling with smart recovery

**The foundation is set for Phase 2's server-side memory ownership, RAG-based selective retrieval, and artifact extraction - the path to true "zero drift" and the externalized brain that Reddit demands.**

**Deployment:** Edge function updated and deployed to Supabase.

**Next Actions:**
1. Update client to handle `router_decision` SSE events
2. Display routing transparency to users (optional subtle UI)
3. Implement error handling based on structured error types
4. Monitor router metrics to refine classification heuristics
5. Begin Phase 2 planning for server-side memory management
