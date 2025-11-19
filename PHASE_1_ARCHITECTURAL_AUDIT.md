# Phase 1: Architectural Foundation Audit
## AI Chat Router - System Baseline Documentation

**Audit Date:** 2025-11-08
**Purpose:** Comprehensive inventory of existing architecture to establish contracts for Context Integrity, Lane Events, and Naming Strategy

---

## Table of Contents
- [I. Context Integrity Inventory](#i-context-integrity-inventory)
- [II. Lane Event Contract Inventory](#ii-lane-event-contract-inventory)
- [III. Naming Strategy Inventory](#iii-naming-strategy-inventory)
- [IV. Recommendations](#iv-recommendations)

---

## I. Context Integrity Inventory

### 1.1 Context Identification and Source Control

#### Git Integration Status
**Current State:** ❌ **NOT IMPLEMENTED**

The system currently does NOT have:
- Git authentication mechanism
- Repository cloning/reading functionality
- Commit SHA tracking
- Branch/tag management

**File Source:** User-uploaded files only via browser

**Storage Location:** `stored_files` table in Supabase
- `id` (uuid) - File identifier
- `user_id` (uuid) - Owner
- `name` (text) - Filename
- `content` (text) - Full file content
- `mime_type` (text) - Content type
- `size` (bigint) - File size in bytes
- `created_at` (timestamptz) - Upload timestamp

#### Provenance Logic
**Current Provenance Data:**
```typescript
// NO repository tracking
// NO commit SHA tracking
// NO branch/ref tracking

// Only basic metadata available:
interface StoredFile {
  id: string;
  name: string;
  content: string;
  mime_type: string;
  size: number;
}
```

**Critical Gap:** Zero provenance metadata. Files cannot be traced back to:
- Source repository
- Specific commit
- Branch or tag
- Git history

### 1.2 Context Inclusion Logic (The Manifest)

#### File Selection Rules
**Current Implementation:**
- Manual file upload via browser (`<input type="file">`)
- User explicitly selects which files to attach to each message
- No automatic file discovery
- No glob pattern matching
- No `.gitignore` parsing

**File Processing:** `src/hooks/useSupabaseData.ts:88-105`
```typescript
const addFile = async (file: File) => {
  const content = await file.text();
  const { data, error } = await supabase
    .from('stored_files')
    .insert({
      user_id: userId,
      name: file.name,
      content: content,
      mime_type: file.type || 'text/plain',
      size: file.size,
    })
    .select()
    .single();
};
```

#### Exclusion Rules
**Current Implementation:** ❌ **NONE**

No filtering for:
- Binary files
- Large files
- Build artifacts (`node_modules`, `dist`)
- System files (`.DS_Store`, `.git`)

**Risk:** Users can upload any file type, including binaries, which may cause issues with text-based AI processing.

### 1.3 Context Storage and Persistence

#### Current Database Schema

**Primary Table:** `stored_files`
```sql
CREATE TABLE stored_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  content text NOT NULL,  -- Stores full file content as text
  mime_type text NOT NULL,
  size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Storage Strategy:**
- Direct database storage (not blob storage)
- Text-only content (no binary support)
- No compression
- No chunking for large files
- No versioning

**Data Types:**
- File content: `text` (PostgreSQL TEXT type)
- File identifiers: `uuid`
- Timestamps: `timestamptz`
- Size: `bigint` (bytes)

**In-Memory Representation:** `src/types.ts:7-13`
```typescript
export interface StoredFile {
  id: string;
  name: string;
  content: string;  // Full content loaded into memory
  mime_type: string;
  size: number;
}
```

**Message Association:** Files are attached at message-send time
```typescript
// src/hooks/useAiRouterChat.ts:133-139
const fileAttachments: FileAttachment[] | undefined =
  attachedFiles.length > 0
    ? attachedFiles.map((file) => ({
        name: file.name,
        content: file.content,  // Full content sent to edge function
      }))
    : undefined;
```

### 1.4 Caching Mechanisms

#### Existing Cache Keys
**Current Implementation:** ❌ **NO CACHING**

- No Redis cache
- No in-memory cache
- No edge function caching
- Files fetched from database on every request

#### Invalidation Strategy
**Current Implementation:** ❌ **N/A**

No cache invalidation because there is no cache.

**File Updates:** Files are immutable once uploaded (no update mechanism exists)

---

## II. Lane Event Contract Inventory

### 2.1 Communication Protocol

#### Transport Mechanism
**Technology:** ✅ **Server-Sent Events (SSE)** via HTTP Streaming

**Connection Flow:**
1. Frontend initiates POST request to edge function
2. Backend streams newline-delimited JSON chunks
3. Frontend reads stream via `ReadableStream` API

**Implementation:** `src/hooks/useAiRouterChat.ts:156-183`
```typescript
const response = await fetch(AI_ROUTER_FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    'X-Request-Id': crypto.randomUUID(),
  },
  body: JSON.stringify({
    sessionId,
    userMessage: content,
    attachedFiles: fileAttachments,
    model: selectedModel === 'auto' ? undefined : selectedModel,
  }),
  signal: abortControllerRef.current.signal,
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
```

**Backend Implementation:** `supabase/functions/ai-chat-router/index.ts:539-562`
```typescript
const stream = new ReadableStream({
  async start(controller) {
    const write = (obj: any) =>
      controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

    for await (const chunk of routeAndExecute(...)) {
      write(chunk);
    }
    controller.close();
  }
});

return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  }
});
```

### 2.2 Current Event Payloads (The Protocol)

#### Event Type Contract
**TypeScript Definition:** `src/types.ts:34-51`
```typescript
export interface StreamChunk {
  type:
    | 'text'           // Content chunk (AI response)
    | 'error'          // Error occurred
    | 'progress'       // Progress update
    | 'model_switch'   // AI model routing decision
    | 'action_request' // Request for frontend action
    | 'metadata'       // Additional context
    | 'warning'        // Non-fatal warning
    | 'success'        // Success notification
    | 'done';          // Stream complete

  content?: string | Record<string, unknown>;
  model?: string;
  metadata?: Record<string, unknown>;
  action?: string;
  progress?: number;
  step?: string;
}
```

#### Live Event Samples

**1. Initialization Event**
```json
{
  "type": "model_switch",
  "content": "Analyzing request...",
  "model": "system"
}
```

**2. Model Selection Event**
```json
{
  "type": "model_switch",
  "content": "Routing to claude - Task: draft_code (95% confidence)",
  "model": "claude",
  "metadata": {
    "routing": "Task: draft_code (95% confidence)"
  }
}
```

**3. Progress Event**
```json
{
  "type": "progress",
  "progress": 45,
  "step": "Processing with Claude..."
}
```

**4. Content Chunk Event**
```json
{
  "type": "text",
  "content": "Here's the refactored code:\n\n```typescript\n",
  "model": "claude"
}
```

**5. Action Request Event (Schema Save)**
```json
{
  "type": "action_request",
  "content": "Saving schema...",
  "model": "gemini",
  "action": {
    "name": "save_schema",
    "args": {
      "name": "UserSchema",
      "content": "{\"type\":\"object\",\"properties\":{...}}",
      "format": "json_schema"
    }
  }
}
```

**6. Metadata Event**
```json
{
  "type": "metadata",
  "content": {
    "tokensUsed": "3245",
    "processingTimeMs": 1823,
    "confidence": 0.95
  }
}
```

**7. Warning Event**
```json
{
  "type": "warning",
  "content": "File size exceeds recommended limit (2MB). Processing may be slow."
}
```

**8. Error Event**
```json
{
  "type": "error",
  "content": "Claude API error: 429 Too Many Requests - Rate limit exceeded",
  "model": "claude"
}
```

**9. Completion Event**
```json
{
  "type": "done"
}
```

### 2.3 Metadata and Metrics

#### Available Fields

**Message-Level Metadata:** `src/types.ts:22-30`
```typescript
interface ChatMessage {
  // ... other fields
  metadata?: {
    provider?: string;          // AI model used (claude/gemini/openai)
    taskInfo?: string;          // Routing reasoning
    tokensUsed?: string;        // Token count (if available)
    estimatedTime?: string;     // Estimated completion time
    taskType?: string;          // Task classification
    confidence?: number;        // Routing confidence (0-1)
    processingTimeMs?: number;  // Actual processing time
  };
}
```

**Database-Stored Metadata:** `ai_messages` table
```sql
CREATE TABLE ai_messages (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'model', 'system')),
  content text NOT NULL,
  task_type text,              -- e.g., 'draft_code', 'analyze_file'
  provider text,               -- e.g., 'claude', 'gemini', 'openai'
  metadata jsonb DEFAULT '{}', -- Flexible JSON storage
  model text DEFAULT 'system', -- Specific model used
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Run Identifiers:**
- Session ID: User-generated UUID for conversation grouping
- Conversation ID: Database-generated UUID for thread persistence
- Message ID: Auto-incrementing bigserial for ordering
- Request ID: `X-Request-Id` header (UUID) for request tracing

**Timestamps:**
- Frontend: `Date.now()` milliseconds since epoch
- Backend: `timestamptz` PostgreSQL timestamps
- No elapsed time tracking (computed on-demand from created_at)

**Model Identifiers:**
```typescript
// Frontend representation
type ModelChoice = 'auto' | 'gpt-5' | 'claude-sonnet-4-5' | 'gemini-2.5-flash';

// Backend API identifiers
const API_MODELS = {
  'gpt-5': 'gpt-5',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'gemini-2.5-flash': 'gemini-2.5-flash'
};

// Internal routing identifiers
type RoutedModel = 'claude' | 'gemini' | 'openai';
```

**Usage Metrics:**
- Token counts: Stored as strings (not computed, depends on API response)
- Response time: Can be computed from message timestamps
- Confidence scores: Stored during routing decision (0.0 - 1.0)

**Provenance Data:**
- Link to session: `session_id` in `ai_conversations`
- Link to conversation: `conversation_id` in `ai_messages`
- NO link to source files
- NO link to Git commits

---

## III. Naming Strategy Inventory

### 3.1 Architectural Mapping (Proto-Lanes)

#### Current System Architecture

**Backend Processing Flow:** `supabase/functions/ai-chat-router/index.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ PROTO-FEED LANE (Data Gathering & Context Grounding)       │
├─────────────────────────────────────────────────────────────┤
│ Module: getOrCreateConversation()                           │
│ Module: fetchHistory()                                      │
│ Module: prepareMessagePayload()                             │
│ Module: detectExplicitModelRequest()                        │
│ Module: classifyIntent()                                    │
│                                                              │
│ Responsibilities:                                            │
│ - Load conversation history (30 messages)                   │
│ - Attach file content to user message                       │
│ - Classify user intent (draft_code, analyze_file, etc.)    │
│ - Detect explicit model requests                            │
│ - Build context for AI processing                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PROTO-LOGIC LANE (Transformation & Core Work)              │
├─────────────────────────────────────────────────────────────┤
│ Module: routeAndExecute()                                   │
│ Module: processClaudeTask()                                 │
│ Module: processOpenAITask()                                 │
│ Module: processGeminiTask()                                 │
│ Module: buildSystemPrompt()                                 │
│                                                              │
│ Responsibilities:                                            │
│ - Route to appropriate AI model                             │
│ - Execute AI API calls                                       │
│ - Stream responses                                           │
│ - Handle tool calls (save_schema)                           │
│ - Transform content through AI processing                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ PROTO-DECISION LANE (Synthesis & Output Formatting)        │
├─────────────────────────────────────────────────────────────┤
│ Module: insertMessage()                                     │
│ Module: Stream Controller (write function)                  │
│ Module: Frontend Event Handlers                             │
│                                                              │
│ Responsibilities:                                            │
│ - Format streaming chunks                                    │
│ - Persist assistant response to database                    │
│ - Emit structured events (progress, metadata, done)        │
│ - Handle action requests                                     │
│ - Finalize and complete stream                              │
└─────────────────────────────────────────────────────────────┘
```

#### Module Identification

**Proto-Feed Modules:**
- `getOrCreateConversation()` - Line 148-176
- `fetchHistory()` - Line 178-194
- `prepareMessagePayload()` - Line 196-204
- `detectExplicitModelRequest()` - Line 28-91
- `classifyIntent()` - Line 93-119

**Proto-Logic Modules:**
- `routeAndExecute()` - Line 427-482
- `processClaudeTask()` - Line 226-280
- `processOpenAITask()` - Line 282-336
- `processGeminiTask()` - Line 338-425
- `buildSystemPrompt()` - Line 121-146

**Proto-Decision Modules:**
- `insertMessage()` - Line 206-224
- Stream Controller - Line 539-562
- Frontend handlers - `src/hooks/useAiRouterChat.ts:202-317`

### 3.2 Current Backend/API Terminology

#### Internal State Names

**Task Type Classification:**
```typescript
const PROVIDER_ROUTING = {
  draft_code: "claude",      // Code generation/refactoring
  general_chat: "claude",    // General conversation
  analyze_file: "gemini",    // File analysis
  extract_schema: "gemini",  // Schema extraction
  unknown: "claude"          // Fallback
};
```

**Message Roles:**
```sql
CHECK (role IN ('user', 'assistant', 'model', 'system'))
```

**Processing States (Implicit):**
- No explicit state machine
- State inferred from event stream position
- Frontend tracks: `isSending`, `isLoadingHistory`, `currentProgress`

**Variable Names:**
```typescript
// Backend (edge function)
let assistantBuffer = "";
let lastModel = "system";
let lastTaskType = "unknown";

// Frontend hook
const [isSending, setIsSending] = useState(false);
const [isLoadingHistory, setIsLoadingHistory] = useState(false);
const [currentProgress, setCurrentProgress] = useState(0);
const [currentStep, setCurrentStep] = useState('');
```

#### API Endpoint Names

**Single Endpoint:** `/functions/v1/ai-chat-router`
- Method: POST
- Purpose: Process AI chat requests with routing

**No additional endpoints for:**
- Starting tasks (same endpoint)
- Monitoring progress (via SSE stream)
- Cancelling tasks (via AbortController)

### 3.3 Current UI/UX Terminology

#### User-Facing Status Messages

**Loading States:** `src/hooks/useAiRouterChat.ts:115`
```typescript
setCurrentStep('Initializing...');
```

**Progress Steps (from event stream):**
```typescript
// Examples from actual events:
"Analyzing request..."
"Routing to claude - Task: draft_code (95% confidence)"
"Processing with Claude..."
"Complete"
"Cancelled"
```

**Message Status:** `src/types.ts:20`
```typescript
status?: 'sending' | 'streaming' | 'complete' | 'error';
```

**UI Labels:** `src/components/ChatInterface.tsx`
- "Start a Conversation"
- "Loading conversation history..."
- "New Conversation"
- "message" / "messages"
- Model names: "Auto Router", "GPT-5", "Claude Sonnet 4.5", "Gemini 2.5 Flash"

**Action Buttons:**
- "Clear Chat"
- "Delete Session"
- "Cancel" (during streaming)
- "⏸️ Cancel" (in progress indicator)

#### Visualizer Language

**Progress Indicator:** `src/components/ProgressIndicator.tsx`
```typescript
interface ProgressIndicatorProps {
  progress: number;    // 0-100 percentage
  step: string;        // Current step description
  onCancel: () => void;
  estimatedTime?: string;  // "a few seconds", "~10 seconds"
}
```

**Display Elements:**
- Progress bar (visual)
- Step text (e.g., "Processing with Claude...")
- Percentage (e.g., "45%")
- Estimated time (e.g., "Est. ~10 seconds")

**No dedicated lane visualizer** - Only single progress indicator

---

## IV. Recommendations

### 4.1 Critical Gaps to Address in Phase 1

#### Context Integrity
1. **Missing Git Integration**
   - Implement repository cloning
   - Add commit SHA tracking
   - Store provenance metadata (repo, ref, commit)

2. **No Context Manifest**
   - Define file inclusion rules
   - Implement `.gitignore` parsing
   - Add binary file filtering

3. **No Caching Strategy**
   - Implement context pack caching
   - Add cache invalidation on Git changes
   - Store computed embeddings

#### Lane Event Contract
1. **Inconsistent Event Metadata**
   - Standardize all event payloads
   - Add required fields (run_id, timestamp, lane_id)
   - Document event schema formally

2. **Missing Provenance**
   - Link events to source context
   - Track which files influenced output
   - Store Git commit reference in events

#### Naming Strategy
1. **No Explicit Lane Terminology**
   - Formalize "Three Lane" architecture
   - Rename modules to match lane structure
   - Update UI terminology consistently

2. **Dual-Layer Vocabulary Needed**
   - Technical: Feed/Logic/Decision
   - User-facing: Start/Build/Finish
   - Document translation layer

### 4.2 Schema Changes Required

#### New Table: `ai_context_packs`
```sql
CREATE TABLE ai_context_packs (
  id uuid PRIMARY KEY,
  repo text NOT NULL,
  ref text NOT NULL,
  commit_sha text NOT NULL,
  manifest jsonb NOT NULL,  -- File inclusion rules
  created_at timestamptz NOT NULL,
  UNIQUE(repo, ref, commit_sha)
);
```

#### New Columns: `ai_messages`
```sql
ALTER TABLE ai_messages
  ADD COLUMN context_pack_id uuid REFERENCES ai_context_packs(id),
  ADD COLUMN lane_phase text CHECK (lane_phase IN ('feed', 'logic', 'decision')),
  ADD COLUMN run_id uuid,
  ADD COLUMN elapsed_ms integer;
```

### 4.3 Next Steps

1. **Freeze Event Contract** - Document all event types formally
2. **Implement Context Packs** - Add Git integration and provenance
3. **Rename for Clarity** - Apply dual-layer vocabulary
4. **Add Observability** - Implement proper lane tracking and metrics

---

## Appendix: Key File Locations

**Configuration:**
- Environment: `.env`
- Supabase Client: `src/lib/supabaseClient.ts`

**Frontend:**
- Main Hook: `src/hooks/useAiRouterChat.ts`
- Data Hook: `src/hooks/useSupabaseData.ts`
- Types: `src/types.ts`
- Router Logic: `src/lib/aiRouter.ts`

**Backend:**
- Edge Function: `supabase/functions/ai-chat-router/index.ts`

**Database:**
- Migrations: `supabase/migrations/*.sql`
- Tables: `ai_conversations`, `ai_messages`, `stored_files`, `saved_schemas`, `extracted_schemas`

**UI Components:**
- Chat Interface: `src/components/ChatInterface.tsx`
- Progress: `src/components/ProgressIndicator.tsx`
- Messages: `src/components/MessageList.tsx`, `MessageBubble.tsx`
