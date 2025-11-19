# Model Types Alignment - Frontend ↔ Backend

## ✅ Complete Type Alignment

### **Updated Type Definitions**

**Frontend (TypeScript):**
```typescript
// src/config/models.tsx
export type AiModelKey = 'auto' | 'anthropic' | 'gemini' | 'openai';

// src/hooks/useAiRouterChat.ts
export type AiProvider = 'anthropic' | 'gemini' | 'openai';
```

**Backend (Edge Function):**
```typescript
// supabase/functions/ai-chat-router/index.ts
providerHint?: 'anthropic' | 'gemini' | 'openai';
```

### **Model Configuration**

| UI Key | Display Name | Backend Provider | Model ID |
|--------|--------------|------------------|----------|
| `auto` | Auto Router | (automatic selection) | - |
| `anthropic` | Claude 3.5 Sonnet | `anthropic` | `claude-3-5-sonnet-20240620` |
| `gemini` | Gemini 1.5 Flash | `gemini` | `gemini-1.5-flash-latest` |
| `openai` | GPT-4o | `openai` | `gpt-4o` |

### **Key Changes**

**Before:**
- Frontend used: `'claude'`, `'gemini-pro'`, `'gemini-flash'`, `'chatgpt-4.1'`, `'gpt-5'`
- Required complex mapping logic: `selectedModel === 'gpt' ? 'openai' : selectedModel`

**After:**
- Frontend uses: `'anthropic'`, `'gemini'`, `'openai'`
- Direct pass-through: `selectedModel === 'auto' ? undefined : selectedModel`

### **Files Updated**

1. **`src/config/models.tsx`**
   - Simplified from 6 model keys to 3
   - Aligned keys with backend expectations
   - Updated model names and descriptions

2. **`src/hooks/useAiRouterChat.ts`**
   - Added `AiProvider` type
   - Updated `UseAiRouterChatArgs.selectedModel` type
   - Simplified provider hint logic (removed mapping)

3. **`src/components/ChatInterface.tsx`**
   - Already compatible (uses `AiModelKey` from models.tsx)

### **Benefits**

✅ **Type Safety:** TypeScript enforces correct provider names
✅ **Simplicity:** No more mapping logic needed
✅ **Clarity:** Model keys match backend expectations
✅ **Maintainability:** Single source of truth for provider names

### **Backward Compatibility**

The `getModelConfig()` helper still supports legacy provider strings from message metadata:
- `'claude'` → `MODEL_CONFIGS.anthropic`
- `'gemini-1.5-flash-latest'` → `MODEL_CONFIGS.gemini`
- `'gpt-4o'` → `MODEL_CONFIGS.openai`

### **Usage Example**

```typescript
// In ChatInterface
const [selectedModel, setSelectedModel] = useState<AiModelKey>('auto');

// Sent to backend
const providerHint = selectedModel === 'auto' ? undefined : selectedModel;

// Backend receives
{ 
  providerHint: 'anthropic' | 'gemini' | 'openai' | undefined
}

// Backend selects
if (providerHint === 'openai') return { provider: 'openai', model: 'gpt-4o' };
if (providerHint === 'gemini') return { provider: 'gemini', model: 'gemini-1.5-flash-latest' };
if (providerHint === 'anthropic') return { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' };
```

### **Build Status**

✅ TypeScript compilation successful
✅ No type errors
✅ All imports resolved
✅ Production bundle created

---

**Status:** Complete and Production Ready
**Build:** ✅ Successful (26.14s)
