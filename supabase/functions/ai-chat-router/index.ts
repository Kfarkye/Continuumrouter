// ============================================================================
// IMPORTS & EDGE RUNTIME CONFIGURATION
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// ============================================================================
// CONFIGURATION & ENVIRONMENT VARIABLES
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
  MAX_TOKENS_DEFAULT: 8192
};

const env = {
  ANTHROPIC_API_KEY: Deno.env.get("ANTHROPIC_API_KEY"),
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY')
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[INIT] CRITICAL: Missing Supabase environment variables.");
}

const supabaseAdmin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
const encoder = new TextEncoder();

// ============================================================================
// UTILITIES & LOGGING
// ============================================================================
function log(level: string, message: string, metadata: Record<string, any> = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  }));
}

log("INFO", "[INIT] AI Chat Router Initializing.");

// ============================================================================
// ROUTER CONFIGURATION
// ============================================================================
const ROUTER_CONFIG = {
  'claude-3.5-sonnet': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    strengths: ['nuance', 'writing', 'reasoning', 'long-context', 'analysis', 'speed', 'vision']
  },
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    strengths: ['logic', 'multimodal', 'analysis', 'structured-output', 'vision', 'coding']
  },
  'gemini-1.5-flash': {
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    strengths: ['speed', 'cost', 'summarization', 'quick-tasks', 'vision']
  }
};

const DEFAULT_MODEL_KEY = 'claude-3.5-sonnet';

// ============================================================================
// INTELLIGENT ROUTING LOGIC
// ============================================================================
function routeRequest(userMessage: string, imageCount: number, hint?: string) {
  if (hint && hint !== 'auto') {
    const profileKey = Object.keys(ROUTER_CONFIG).find(key => ROUTER_CONFIG[key as keyof typeof ROUTER_CONFIG].provider === hint);
    if (profileKey) {
      const profile = ROUTER_CONFIG[profileKey as keyof typeof ROUTER_CONFIG];
      return { taskType: 'override', profile, reasoning: `User override selected ${hint}.` };
    }
  }

  if (imageCount > 0) {
    if (imageCount >= 3 || /\b(analyze|interpret|diagram|chart|vision|look|code|screenshot|compare)\b/i.test(userMessage)) {
      const profile = ROUTER_CONFIG['gpt-4o'];
      return { taskType: 'multimodal_heavy', profile, reasoning: `Complex vision task or high image count (${imageCount}).` };
    }
    const profile = ROUTER_CONFIG[DEFAULT_MODEL_KEY];
    return { taskType: 'multimodal_standard', profile, reasoning: `Standard image task (${imageCount}).` };
  }

  const patterns = {
    technical: /\b(code|function|debug|json|api|sql|regex|algorithm|error message|javascript|python|typescript)\b/i,
    quick: /\b(what is|define|explain briefly|summarize|tl;dr|quick fact)\b/i,
    writing: /\b(email|draft|compose|write a story|blog post|creative|nuance)\b/i
  };

  if (patterns.technical.test(userMessage)) {
    const profile = ROUTER_CONFIG['gpt-4o'];
    return { taskType: 'technical', profile, reasoning: `Technical/Code task detected.` };
  }

  if (patterns.quick.test(userMessage) && userMessage.length < 300) {
    const profile = ROUTER_CONFIG['gemini-1.5-flash'];
    return { taskType: 'quick_task', profile, reasoning: `Brief query detected.` };
  }

  if (patterns.writing.test(userMessage)) {
    const profile = ROUTER_CONFIG['claude-3.5-sonnet'];
    return { taskType: 'writing', profile, reasoning: `Writing task detected.` };
  }

  const profile = ROUTER_CONFIG[DEFAULT_MODEL_KEY];
  return { taskType: 'general', profile, reasoning: `General conversation.` };
}

// =============================================================================
// API STREAM HANDLING
// =============================================================================
async function processStream(response: Response, parser: (data: string) => string | null, provider: string): Promise<ReadableStream> {
  if (!response.body) throw new Error(`No response body from ${provider} API.`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            try {
              const data = buffer.trim().startsWith('data: ') ? buffer.trim().slice(6).trim() : buffer.trim();
              if (data !== '[DONE]') {
                const chunk = parser(data);
                if (chunk) controller.enqueue(encoder.encode(chunk));
              }
            } catch (e) {
              log("WARN", `Failed to parse final buffer from ${provider}`, { error: (e as Error).message });
            }
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let data = line;
          if (line.startsWith('data: ')) {
            data = line.slice(6).trim();
          } else {
            continue;
          }

          if (data === '[DONE]') continue;

          try {
            const chunk = parser(data);
            if (chunk) controller.enqueue(encoder.encode(chunk));
          } catch (e) {
            log("ERROR", `Failed to parse chunk from ${provider}`, { error: (e as Error).message });
          }
        }
      }
    }
  });
}

// =============================================================================
// PROVIDER API IMPLEMENTATIONS
// =============================================================================
async function callAnthropicAPI(model: string, messages: any[], systemPrompt?: string): Promise<ReadableStream> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Configuration Error: Anthropic API key is missing.");

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: CONFIG.MAX_TOKENS_DEFAULT,
      messages,
      stream: true,
      system: systemPrompt
    }),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status}. ${errorText}`);
  }

  const parser = (data: string): string | null => {
    const parsed = JSON.parse(data);
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
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
      max_tokens: CONFIG.MAX_TOKENS_DEFAULT
    }),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS)
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
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: CONFIG.MAX_TOKENS_DEFAULT
      }
    }),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS)
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
    log("WARN", "[SSE] Failed to send SSE event", { error: (e as Error).message });
  }
}

async function getDomainContext(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('clinician_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) return null;
    return `User Context: Healthcare recruiter managing clinician ${data.full_name}.`;
  } catch (error) {
    log("ERROR", "[CONTEXT] Error fetching domain context", { userId, error: (error as Error).message });
    return null;
  }
}

async function fetchAndEncodeImages(imageIds: string[], userId: string): Promise<any[]> {
  if (!imageIds || imageIds.length === 0) return [];

  log("DEBUG", "[IMAGES] Fetching images", { count: imageIds.length });

  const { data: imageRecords, error } = await supabaseAdmin
    .from('uploaded_images')
    .select('id, mime_type, storage_path')
    .in('id', imageIds)
    .eq('user_id', userId);

  if (error || !imageRecords || imageRecords.length === 0) {
    log("ERROR", "[IMAGES] Failed to fetch image records", { error: error?.message, imageIds });
    return [];
  }

  const downloadPromises = imageRecords.map(async (record) => {
    if (!record.storage_path || !record.mime_type) {
      log("ERROR", `[IMAGES] Missing storage_path or mime_type for image ${record.id}`);
      return null;
    }

    log("DEBUG", "[IMAGES] Downloading from storage", {
      bucket: CONFIG.IMAGE_BUCKET_NAME,
      path: record.storage_path
    });

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CONFIG.IMAGE_BUCKET_NAME)
      .download(record.storage_path);

    if (downloadError || !fileData) {
      log("ERROR", `[IMAGES] Failed to download image ${record.id}`, {
        error: downloadError?.message,
        path: record.storage_path
      });
      return null;
    }

    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(arrayBuffer);

      return {
        id: record.id,
        mimeType: record.mime_type,
        base64Data: base64
      };
    } catch (e) {
      log("ERROR", `[IMAGES] Failed to encode image ${record.id}`, { error: (e as Error).message });
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  const successfulImages = results.filter((img): img is NonNullable<typeof img> => img !== null);

  log("DEBUG", "[IMAGES] Image processing complete", {
    successCount: successfulImages.length,
    requestedCount: imageIds.length
  });

  return successfulImages;
}

// =============================================================================
// MESSAGE FORMATTING
// =============================================================================
function cloneMessages(messages: any[]) {
  return structuredClone(messages);
}

const ensureStringContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find(block =>
      (block.type === 'text' && typeof block.text === 'string') || typeof block === 'string'
    );
    if (textBlock) return typeof textBlock === 'string' ? textBlock : textBlock.text;
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

function formatForAnthropic(messages: any[], images: any[]) {
  const clonedMessages = cloneMessages(messages);
  const systemPrompt = clonedMessages.find((m: any) => m.role === 'system')?.content;

  const apiMessages = clonedMessages
    .filter((m: any) => m.role !== 'system')
    .map((m: any) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

  const lastMessage = apiMessages[apiMessages.length - 1];

  if (lastMessage && lastMessage.role === 'user' && images.length > 0) {
    const textContent = ensureStringContent(lastMessage.content);
    const contentBlocks: any[] = [{ type: 'text', text: textContent }];

    images.forEach((img: any) => {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.base64Data
        }
      });
    });

    lastMessage.content = contentBlocks;
  }

  const validatedMessages: any[] = [];
  let lastRole: string | null = null;

  for (const message of apiMessages) {
    if (message.role === lastRole) {
      const previousMessage = validatedMessages[validatedMessages.length - 1];
      if (previousMessage) {
        const prevContent = Array.isArray(previousMessage.content)
          ? previousMessage.content
          : [{ type: 'text', text: ensureStringContent(previousMessage.content) }];
        const currentContent = Array.isArray(message.content)
          ? message.content
          : [{ type: 'text', text: ensureStringContent(message.content) }];
        previousMessage.content = [...prevContent, ...currentContent];
      }
    } else {
      validatedMessages.push(message);
      lastRole = message.role;
    }
  }

  return { apiMessages: validatedMessages, systemPrompt };
}

function formatForOpenAI(messages: any[], images: any[]) {
  const clonedMessages = cloneMessages(messages);
  const formattedMessages = clonedMessages.map((m: any) => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: m.content
  }));

  const lastMessage = formattedMessages[formattedMessages.length - 1];

  if (lastMessage && lastMessage.role === 'user' && images.length > 0) {
    const textContent = ensureStringContent(lastMessage.content);
    const contentBlocks: any[] = [{ type: 'text', text: textContent }];

    images.forEach((img: any) => {
      contentBlocks.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64Data}`,
          detail: 'auto'
        }
      });
    });

    lastMessage.content = contentBlocks;
  }

  return formattedMessages;
}

function formatForGemini(messages: any[], images: any[]) {
  const clonedMessages = cloneMessages(messages);
  const contents: any[] = [];

  let systemInstruction = clonedMessages.find((m: any) => m.role === 'system')?.content;
  const historyMessages = clonedMessages.filter((m: any) => m.role !== 'system');

  historyMessages.forEach((m: any, index: number) => {
    const role = m.role === 'user' ? 'user' : 'model';
    const textContent = ensureStringContent(m.content);
    const parts: any[] = [{ text: textContent }];

    if (m.role === 'user' && index === historyMessages.length - 1 && images.length > 0) {
      images.forEach((img: any) => {
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
    if (contents.length > 0 && contents[0].role === 'user') {
      contents[0].parts.unshift({ text: `[SYSTEM INSTRUCTION: ${systemInstruction}]\n\n` });
    } else {
      contents.unshift({
        role: 'user',
        parts: [{ text: systemInstruction }]
      });
    }
  }

  const validatedContents: any[] = [];
  let lastRole: string | null = null;

  for (const content of contents) {
    if (content.role === lastRole) {
      const previousContent = validatedContents[validatedContents.length - 1];
      if (previousContent) {
        previousContent.parts.push(...content.parts);
      }
    } else {
      validatedContents.push(content);
      lastRole = content.role;
    }
  }

  return validatedContents;
}

// =============================================================================
// MAIN REQUEST HANDLER
// =============================================================================
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = performance.now();

  log("INFO", "[REQUEST] Incoming Request", { method: req.method, url: req.url, requestId });

  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUserClient = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const payload = await req.json();
    const { sessionId, userMessage, imageIds, providerHint, memories, spaceId } = payload;

    if (!sessionId || !userMessage) {
      return new Response(JSON.stringify({ error: 'Missing required fields (sessionId, userMessage)' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (userMessage.length > CONFIG.MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ error: `Message exceeds maximum length` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (imageIds && imageIds.length > CONFIG.MAX_IMAGES) {
      return new Response(JSON.stringify({ error: `Exceeds maximum image count` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const conversationPromise = supabaseAdmin
      .from('ai_conversations')
      .upsert({
        session_id: sessionId,
        user_id: user.id,
        space_id: spaceId || null
      }, {
        onConflict: 'session_id',
        ignoreDuplicates: false
      })
      .select('id')
      .single();

    const [conversationResult, domainContext, images] = await Promise.all([
      conversationPromise,
      getDomainContext(user.id),
      fetchAndEncodeImages(imageIds || [], user.id)
    ]);

    if (conversationResult.error || !conversationResult.data) {
      log("ERROR", "[DB] Failed to manage conversation state", {
        requestId,
        error: conversationResult.error?.message
      });
      throw new Error(`Database error: Failed to manage conversation state.`);
    }

    const conversationId = conversationResult.data.id;

    if (imageIds && imageIds.length > images.length) {
      log("WARN", "[IMAGES] Partial failure in image processing", {
        requestId,
        expectedCount: imageIds.length,
        processedCount: images.length
      });
    }

    const historyResult = await supabaseAdmin
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(CONFIG.HISTORY_LIMIT);

    const conversationHistory = historyResult.data || [];

    let systemMessage = `You are a helpful, intelligent AI assistant. Respond accurately, concisely, and naturally. Current Date: ${new Date().toISOString()}.`;

    if (domainContext) {
      systemMessage += `\n\n${domainContext}`;
    }

    if (memories && memories.length > 0) {
      systemMessage += `\n\nRelevant Context/Memories:\n${memories.map((m: any) => `- ${m.content}`).join('\n')}`;
    }

    const conversationMessages = [
      { role: 'system', content: systemMessage },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const routerDecision = routeRequest(userMessage, images.length, providerHint);
    const { profile, taskType, reasoning } = routerDecision;
    const { provider, model } = profile;

    log("INFO", "[ROUTER] Decision Made", {
      requestId,
      provider,
      model,
      taskType,
      reasoning,
      imageCount: images.length
    });

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
      throw new Error(`Unsupported provider configuration: ${provider}`);
    }

    supabaseAdmin.from('ai_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
      metadata: {
        attached_image_ids: imageIds || [],
        input_source: 'router_v2'
      }
    }).then(({ error }) => {
      if (error) log("ERROR", "[DB-ASYNC] Failed to persist user message", {
        requestId,
        error: error.message
      });
    });

    const stream = new ReadableStream({
      async start(controller) {
        let streamProvider = provider;
        try {
          sendSSE(controller, {
            type: 'model_switch',
            provider,
            model,
            metadata: { taskType, reasoning }
          });

          let apiStream: ReadableStream;

          if (provider === 'anthropic') {
            apiStream = await callAnthropicAPI(model, apiPayload, anthropicSystemPrompt);
          } else if (provider === 'openai') {
            apiStream = await callOpenAIAPI(model, apiPayload);
          } else if (provider === 'gemini') {
            apiStream = await callGeminiAPI(model, apiPayload);
          } else {
            throw new Error("API Stream initialization failed due to invalid provider.");
          }

          const reader = apiStream.getReader();
          let assistantResponseText = '';
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            assistantResponseText += chunk;

            sendSSE(controller, {
              type: 'text',
              content: chunk
            });
          }

          sendSSE(controller, { type: 'done' });

          if (assistantResponseText.trim()) {
            const durationMs = performance.now() - startTime;
            supabaseAdmin.from('ai_messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: assistantResponseText,
              model: model,
              task_type: taskType,
              metadata: {
                duration_ms: durationMs,
                provider: provider,
                router_reasoning: reasoning
              }
            }).then(({ error }) => {
              if (error) log("ERROR", "[DB-ASYNC] Failed to persist assistant message", {
                requestId,
                error: error.message
              });
            });
          }

          controller.close();
          log("INFO", "[REQUEST] Stream completed successfully", {
            requestId,
            durationMs: performance.now() - startTime
          });
        } catch (error) {
          log("ERROR", "[STREAM] Error during API streaming", {
            requestId,
            provider: streamProvider,
            error: (error as Error).message,
            stack: (error as Error).stack
          });
          try {
            sendSSE(controller, {
              type: 'error',
              content: `An error occurred during processing: ${(error as Error).message}`
            });
            controller.close();
          } catch (e) {
            // Ignore
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId
      }
    });

  } catch (error) {
    const durationMs = performance.now() - startTime;
    log("ERROR", "[HANDLER] Uncaught request error", {
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack,
      durationMs
    });

    let status = 500;
    const errorMessage = (error as Error).message;

    if (errorMessage.includes("Unauthorized") || errorMessage.includes("Missing authorization")) {
      status = 401;
    } else if (errorMessage.includes("Missing required fields") || errorMessage.includes("exceeds maximum")) {
      status = 400;
    }

    return new Response(JSON.stringify({ error: errorMessage || "Internal Server Error" }), {
      status: status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      }
    });
  }
});
