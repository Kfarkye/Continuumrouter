import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// CONFIGURATION & ENVIRONMENT
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, cache-control',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const CONFIG = {
  MAX_IMAGES: 10,
  MAX_MESSAGE_LENGTH: 100000,
  HISTORY_LIMIT: 20,
  API_TIMEOUT_MS: 90000,
  IMAGE_BUCKET_NAME: 'chat_uploads',
  MAX_TOKENS_DEFAULT: 8192,
};

// Environment Variables
const env = {
  ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY')!,
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[INIT] CRITICAL: Missing Supabase environment variables.");
}

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const encoder = new TextEncoder();

// Structured Logging Utility
function log(level: 'INFO' | 'ERROR' | 'WARN', message: string, metadata: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...metadata }));
}

log("INFO", "[INIT] AI Chat Router Initializing.");

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type Provider = 'anthropic' | 'openai' | 'gemini';

interface ModelProfile {
  provider: Provider;
  model: string;
  strengths: string[];
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'model';
    content: string | any[];
}

// ============================================================================
// ROUTER CONFIGURATION
// ============================================================================

const ROUTER_CONFIG: Record<string, ModelProfile> = {
  'claude-3.5-sonnet': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20240620',
    strengths: ['nuance', 'writing', 'reasoning', 'long-context', 'analysis', 'speed'],
  },
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    strengths: ['logic', 'multimodal', 'analysis', 'structured-output', 'vision'],
  },
  'gemini-1.5-flash': {
    provider: 'gemini',
    model: 'gemini-1.5-flash-latest',
    strengths: ['speed', 'cost', 'summarization', 'quick-tasks'],
  },
};

const DEFAULT_MODEL_KEY = 'claude-3.5-sonnet';

// Startup validation
if (!ROUTER_CONFIG[DEFAULT_MODEL_KEY]) {
    log("ERROR", "[INIT] CRITICAL: Default model configuration is missing!");
    throw new Error("Server configuration error.");
}

// ============================================================================
// ROUTING LOGIC
// ============================================================================

interface RouterDecision {
  taskType: string;
  profile: ModelProfile;
  reasoning: string;
}

function routeRequest(userMessage: string, imageCount: number, hint?: string): RouterDecision {
  // 1. Handle Overrides (Hint)
  if (hint && hint !== 'auto') {
    const profileKey = Object.keys(ROUTER_CONFIG).find(key => ROUTER_CONFIG[key].provider === hint);
    if (profileKey) {
      const profile = ROUTER_CONFIG[profileKey];
      return { taskType: 'override', profile, reasoning: `User override selected ${hint}.` };
    }
  }

  // 2. Automated Routing
  if (imageCount > 0) {
    if (imageCount >= 3 || /\b(analyze|interpret|diagram|chart)\b/i.test(userMessage)) {
      const profile = ROUTER_CONFIG['gpt-4o'] || ROUTER_CONFIG[DEFAULT_MODEL_KEY];
      return { taskType: 'multimodal_heavy', profile, reasoning: `Complex vision task or high image count (${imageCount}).` };
    }
    return { taskType: 'multimodal_standard', profile: ROUTER_CONFIG[DEFAULT_MODEL_KEY], reasoning: `Standard image task (${imageCount}).` };
  }

  const patterns = {
    technical: /\b(code|function|debug|json|api|sql|regex|algorithm)\b/i,
    quick: /\b(what is|define|explain briefly|summarize|tl;dr)\b/i,
  };

  if (patterns.technical.test(userMessage)) {
    const profile = ROUTER_CONFIG['gpt-4o'] || ROUTER_CONFIG[DEFAULT_MODEL_KEY];
    return { taskType: 'technical', profile, reasoning: 'Technical/Code task detected.' };
  }

  if (patterns.quick.test(userMessage) && userMessage.length < 300) {
    const profile = ROUTER_CONFIG['gemini-1.5-flash'] || ROUTER_CONFIG[DEFAULT_MODEL_KEY];
    return { taskType: 'quick_task', profile, reasoning: 'Brief query detected.' };
  }

  // 3. Default
  const profile = ROUTER_CONFIG[DEFAULT_MODEL_KEY];
  return { taskType: 'general', profile, reasoning: 'General conversation.' };
}

// =============================================================================
// API STREAM HANDLING
// =============================================================================

async function processStream(response: Response, parser: (data: string) => string | null, provider: string) {
  if (!response.body) throw new Error(`No response body from ${provider} API.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const chunk = parser(data);
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
            }
          } catch (e) {
            log("ERROR", `Failed to parse chunk from ${provider}`, { error: (e as Error).message });
          }
        }
      }
    }
  });
}

async function callAnthropicAPI(model: string, messages: any[], systemPrompt?: string): Promise<ReadableStream> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Configuration Error: Anthropic API key is missing.");

  const body = {
    model,
    max_tokens: CONFIG.MAX_TOKENS_DEFAULT,
    messages,
    stream: true,
    system: systemPrompt,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status}. ${errorText}`);
  }

  const parser = (data: string): string | null => {
    const parsed = JSON.parse(data);
    if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
      return parsed.delta.text;
    }
    return null;
  };

  return processStream(response, parser, "Anthropic");
}

async function callOpenAIAPI(model: string, messages: any[]): Promise<ReadableStream> {
    if (!env.OPENAI_API_KEY) throw new Error("Configuration Error: OpenAI API key is missing.");

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            max_tokens: CONFIG.MAX_TOKENS_DEFAULT,
        }),
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status}. ${errorText}`);
    }

    const parser = (data: string): string | null => {
        const parsed = JSON.parse(data);
        return parsed?.choices?.[0]?.delta?.content || null;
    };

    return processStream(response, parser, "OpenAI");
}

async function callGeminiAPI(model: string, contents: any[]): Promise<ReadableStream> {
    if (!env.GEMINI_API_KEY) throw new Error("Configuration Error: Gemini API key is missing.");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${env.GEMINI_API_KEY}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.9, maxOutputTokens: CONFIG.MAX_TOKENS_DEFAULT } }),
        signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS),
    });

     if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status}. ${errorText}`);
    }

    const parser = (data: string): string | null => {
        const parsed = JSON.parse(data);
        return parsed?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    };

    return processStream(response, parser, "Gemini");
}

// =============================================================================
// UTILITIES
// =============================================================================

function sendSSE(controller: ReadableStreamDefaultController, data: Record<string, unknown>) {
  try {
    const jsonData = JSON.stringify(data);
    controller.enqueue(encoder.encode(`data: ${jsonData}\n\n`));
  } catch (e) {
    // Prevent error if client disconnected
  }
}

async function getDomainContext(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from('clinicians').select('name, specialties').eq('user_id', userId).maybeSingle();
    if (!data) return null;
    return `User Context: Assisting ${data.name} (Clinician). Specialties: ${data.specialties?.join(', ') || 'N/A'}.`;
  } catch (error) {
    log("ERROR", "[CONTEXT] Error fetching domain context", { userId, error: (error as Error).message });
    return null;
  }
}

async function fetchAndEncodeImages(imageIds: string[], userId: string): Promise<any[]> {
    if (!imageIds || imageIds.length === 0) return [];

    const { data: imageRecords, error } = await supabaseAdmin
        .from('uploaded_images')
        .select('id, mime_type, public_url')
        .in('id', imageIds)
        .eq('user_id', userId);

    if (error) {
        log("ERROR", "[IMAGES] Failed to fetch image records", { error: error.message });
        return [];
    }

    const downloadPromises = imageRecords.map(async (record) => {
        const objectPath = record.public_url?.split('/').pop();
        if (!objectPath) return null;

        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from(CONFIG.IMAGE_BUCKET_NAME)
            .download(objectPath);

        if (downloadError || !fileData) {
            log("ERROR", `[IMAGES] Failed to download image ${record.id}`, { error: downloadError?.message });
            return null;
        }

        try {
            const arrayBuffer = await fileData.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            return {
                id: record.id,
                mimeType: record.mime_type,
                base64Data: base64,
            };
        } catch (e) {
            log("ERROR", `[IMAGES] Failed to process image ${record.id}`, { error: (e as Error).message });
            return null;
        }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter(img => img !== null);
}

// =============================================================================
// MESSAGE FORMATTING
// =============================================================================

function formatForAnthropic(messages: ChatMessage[], images: any[]): { apiMessages: any[], systemPrompt?: string } {
    const systemPrompt = messages.find(m => m.role === 'system')?.content as string | undefined;
    const apiMessages = messages.filter(m => m.role !== 'system');

    const lastMessage = apiMessages[apiMessages.length - 1];

    if (lastMessage && lastMessage.role === 'user' && images.length > 0) {
        const contentBlocks: any[] = [
            { type: 'text', text: lastMessage.content }
        ];

        images.forEach(img => {
            contentBlocks.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: img.mimeType,
                    data: img.base64Data,
                }
            });
        });

        lastMessage.content = contentBlocks;
    }
    return { apiMessages, systemPrompt };
}

function formatForOpenAI(messages: ChatMessage[], images: any[]): any[] {
    const formattedMessages = messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content
    }));

    const lastMessage = formattedMessages[formattedMessages.length - 1];

    if (lastMessage && lastMessage.role === 'user' && images.length > 0) {
        const contentBlocks: any[] = [
            { type: 'text', text: lastMessage.content }
        ];

        images.forEach(img => {
            contentBlocks.push({
                type: 'image_url',
                image_url: {
                    url: `data:${img.mimeType};base64,${img.base64Data}`
                }
            });
        });

        lastMessage.content = contentBlocks;
    }
    return formattedMessages;
}

function formatForGemini(messages: ChatMessage[], images: any[]): any[] {
    const contents: any[] = [];
    let systemInstruction = messages.find(m => m.role === 'system')?.content as string | undefined;

    const historyMessages = messages.filter(m => m.role !== 'system');

    historyMessages.forEach((m, index) => {
        const role = m.role === 'user' ? 'user' : 'model';
        const parts: any[] = [{ text: m.content }];

        if (m.role === 'user' && index === historyMessages.length - 1 && images.length > 0) {
             images.forEach(img => {
                parts.push({
                    inline_data: {
                        mime_type: img.mimeType,
                        data: img.base64Data
                    }
                });
            });
        }
        contents.push({ role, parts });
    });

    if (systemInstruction) {
        if (contents.length === 0 || contents[0].role !== 'user') {
            contents.unshift({ role: 'user', parts: [{ text: systemInstruction }] });
        } else {
            contents[0].parts.unshift({ text: `[SYSTEM INSTRUCTION: ${systemInstruction}]\n\n`});
        }
    }

    return contents;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 1. Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUserClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 2. Payload Validation
    const payload = await req.json();
    const { sessionId, userMessage, imageIds, providerHint, memories, spaceId } = payload;

    if (!sessionId || !userMessage) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 3. Conversation Management & Data Fetching
    const conversationPromise = supabaseAdmin.from('ai_conversations').upsert({
      session_id: sessionId,
      user_id: user.id,
      space_id: spaceId || null,
    }, { onConflict: 'session_id', ignoreDuplicates: false }).select('id').single();

    const [conversationResult, domainContext, images] = await Promise.all([
        conversationPromise,
        getDomainContext(user.id),
        fetchAndEncodeImages(imageIds || [], user.id)
    ]);

    if (conversationResult.error || !conversationResult.data) {
      throw new Error(`Failed to manage conversation: ${conversationResult.error?.message}`);
    }
    const conversationId = conversationResult.data.id;

    const historyResult = await supabaseAdmin.from('ai_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(CONFIG.HISTORY_LIMIT);
    const conversationHistory = (historyResult.data || []) as ChatMessage[];

    // 5. Context Building
    let systemMessage = `You are a helpful AI assistant. Be concise and accurate.`;
    if (domainContext) systemMessage += `\n\n${domainContext}`;
    if (memories && memories.length > 0) {
        systemMessage += `\n\nRelevant Memories:\n${memories.map((m: any) => `- ${m.content}`).join('\n')}`;
    }

    // 6. Prepare Messages
    const conversationMessages: ChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...conversationHistory,
        { role: 'user', content: userMessage }
    ];

    // 7. Intelligent Routing
    const routerDecision = routeRequest(userMessage, images.length, providerHint);
    const { profile, taskType, reasoning } = routerDecision;
    const { provider, model } = profile;

    log("INFO", "[ROUTER] Decision", { requestId, provider, model, reasoning });

    // 8. Format Messages for Provider
    let apiPayload: any;
    let anthropicSystemPrompt: string | undefined;

    if (provider === 'anthropic') {
        const { apiMessages, systemPrompt } = formatForAnthropic(conversationMessages, images);
        apiPayload = apiMessages;
        anthropicSystemPrompt = systemPrompt;
    } else if (provider === 'openai') {
        apiPayload = formatForOpenAI(conversationMessages, images);
    } else if (provider === 'gemini') {
        apiPayload = formatForGemini(conversationMessages, images);
    } else {
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // 9. Persist User Message
    supabaseAdmin.from('ai_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: userMessage,
        metadata: { attached_image_ids: imageIds || [] },
    }).then(({ error }) => {
        if (error) log("ERROR", "[DB] Failed to persist user message", { requestId, error: error.message });
    });

    // 10. Streaming Response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendSSE(controller, { type: 'model_switch', provider, model, metadata: { taskType, reasoning } });

          let apiStream: ReadableStream;

          if (provider === 'anthropic') {
            apiStream = await callAnthropicAPI(model, apiPayload, anthropicSystemPrompt);
          } else if (provider === 'openai') {
            apiStream = await callOpenAIAPI(model, apiPayload);
          } else if (provider === 'gemini') {
            apiStream = await callGeminiAPI(model, apiPayload);
          } else {
            throw new Error(`Unsupported provider: ${provider}`);
          }

          const reader = apiStream.getReader();
          let assistantResponseText = '';
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            assistantResponseText += chunk;
            sendSSE(controller, { type: 'text', content: chunk });
          }

          sendSSE(controller, { type: 'done' });

          // 11. Persist Assistant Message
          if (assistantResponseText.trim()) {
            supabaseAdmin.from('ai_messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: assistantResponseText,
              model: model,
              task_type: taskType,
            }).then(({ error }) => {
                if (error) log("ERROR", "[DB] Failed to persist assistant message", { requestId, error: error.message });
            });
          }

          controller.close();

        } catch (error) {
          log("ERROR", "[STREAM] Error during streaming", { requestId, error: (error as Error).message, stack: (error as Error).stack });
          try {
            sendSSE(controller, { type: 'error', content: `An error occurred: ${(error as Error).message}` });
            controller.close();
          } catch (e) { /* Stream might be closed */ }
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Request-Id': requestId,
      }
    });

  } catch (error) {
    log("ERROR", "[HANDLER] Uncaught request error", { requestId, error: (error as Error).message, stack: (error as Error).stack });
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Request-Id': requestId }
    });
  }
});