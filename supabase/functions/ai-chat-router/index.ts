import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from './_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

const env = Deno.env.toObject();

const CONFIG = {
  API_TIMEOUT_MS: 180000,
  MAX_TOKENS_DEFAULT: 6000,
  IMAGE_BUCKET_NAME: 'chat-uploads'
} as const;

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Configuration Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
}

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const encoder = new TextEncoder();

function log(level: string, message: string, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  }));
}

log("INFO", "[INIT] AI Chat Router Initializing.");

interface RouteProfile {
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;
  limits: {
    maxOutputTokens: number;
    timeoutMs: number;
    temperature: number;
  };
}

const ROUTER_CONFIG: Record<string, RouteProfile> = {
  'anthropic': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7
    }
  },
  'openai': {
    provider: 'openai',
    model: 'gpt-4o',
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7
    }
  },
  'gemini': {
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    limits: {
      maxOutputTokens: 6000,
      timeoutMs: 180000,
      temperature: 0.7
    }
  }
};

const DEFAULT_MODEL_KEY = 'gemini';

interface TaskRouteResult {
  taskType: string;
  profile: RouteProfile;
  reasoning: string;
}

function decideRoute(messages: any[], imageCount: number): TaskRouteResult {
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage?.content?.toLowerCase() || '';

  if (imageCount > 0) {
    const profile = ROUTER_CONFIG['anthropic'];
    return { taskType: 'vision', profile, reasoning: `Vision task with ${imageCount} images.` };
  }

  const codeWords = ['code', 'function', 'debug', 'implement', 'algorithm', 'error', 'bug'];
  if (codeWords.some(word => userText.includes(word))) {
    const profile = ROUTER_CONFIG['anthropic'];
    return { taskType: 'code', profile, reasoning: 'Code-related task.' };
  }

  const creativeWords = ['write', 'story', 'poem', 'creative', 'blog'];
  if (creativeWords.some(word => userText.includes(word))) {
    const profile = ROUTER_CONFIG['openai'];
    return { taskType: 'creative', profile, reasoning: 'Creative writing task.' };
  }

  const profile = ROUTER_CONFIG[DEFAULT_MODEL_KEY];
  return { taskType: 'general', profile, reasoning: `General conversation. Routed to default (Gemini).` };
}

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
            if (provider === 'Gemini') {
              log("DEBUG", `[GEMINI-STREAM] Raw data chunk received`, { dataLength: data.length, dataPreview: data.substring(0, 200) });
            }
            const chunk = parser(data);
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
            } else if (provider === 'Gemini') {
              log("WARN", `[GEMINI-STREAM] Parser returned null for chunk`);
            }
          } catch (e) {
            log("ERROR", `Failed to parse chunk from ${provider}`, { error: (e as Error).message, data: data.substring(0, 200) });
          }
        }
      }
    }
  });
}

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
    const errorText = await response.text();    throw new Error(`Gemini API error: ${response.status}. ${errorText}`);
  }

  const parser = (data: string): string | null => {
    try {
      const parsed = JSON.parse(data);

      log("DEBUG", "[GEMINI-PARSER] Parsed JSON structure", {
        hasCandidates: !!parsed?.candidates,
        candidatesLength: parsed?.candidates?.length,
        hasContent: !!parsed?.candidates?.[0]?.content,
        hasParts: !!parsed?.candidates?.[0]?.content?.parts,
        partsLength: parsed?.candidates?.[0]?.content?.parts?.length,
        keys: Object.keys(parsed || {}).join(', ')
      });

      const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        log("DEBUG", "[GEMINI-PARSER] Successfully extracted text", { textLength: text.length });
      }
      return text || null;
    } catch (e) {
      log("ERROR", "[GEMINI-PARSER] JSON parse failed", { error: (e as Error).message });
      return null;
    }
  };

  return processStream(response, parser, "Gemini");
}

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
        type: 'image',
        source: {
          type: 'base64',
          media_type: record.mime_type,
          data: base64
        }
      };
    } catch (error) {
      log("ERROR", `[IMAGES] Failed to encode image ${record.id}`, { error: (error as Error).message });
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  return results.filter(Boolean);
}

function encodeBase64(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function formatMessagesForProvider(
  provider: 'anthropic' | 'openai' | 'gemini',
  messages: any[],
  images: any[]
): any[] {
  if (provider === 'anthropic') {
    return messages.map((msg: any, idx: number) => {
      if (msg.role === 'user' && idx === messages.length - 1 && images.length > 0) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
            ...images
          ]
        };
      }
      return { role: msg.role, content: msg.content };
    });
  } else if (provider === 'openai') {
    return messages.map((msg: any, idx: number) => {
      if (msg.role === 'user' && idx === messages.length - 1 && images.length > 0) {
        const imageUrls = images.map((img: any) => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.source.media_type};base64,${img.source.data}`
          }
        }));
        return {
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
            ...imageUrls
          ]
        };
      }
      return msg;
    });
  } else if (provider === 'gemini') {
    return messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  return messages;
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  log("INFO", "[REQUEST] Incoming Request", {
    method: req.method,
    url: req.url,
    requestId
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Authorization header missing.");

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) throw new Error("Authentication failed.");

    const body = await req.json();
    const { messages = [], conversationId, preferredProvider, imageIds, mode } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Invalid request: 'messages' must be a non-empty array.");
    }

    const lastUserMessage = messages[messages.length - 1];
    const userText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content.toLowerCase() : '';

    const searchTriggers = [
      /^search[: ]/i,
      /^find[: ]/i,
      /^look up[: ]/i,
      /what (is|are) the latest/i,
      /current (news|events|information)/i,
      /today'?s/i
    ];

    const isSearchQuery = searchTriggers.some(trigger => trigger.test(userText));

    if (isSearchQuery) {
      log("INFO", "[ROUTER] Search query detected, routing to perplexity-search", { requestId });
      return await handleSearchQuery({
        query: lastUserMessage.content,
        conversationId,
        userId: user.id,
        messages,
        supabase: supabaseAdmin,
        corsHeaders
      });
    }

    const startTime = performance.now();

    const images = await fetchAndEncodeImages(imageIds || [], user.id);

    const { taskType, profile, reasoning } = decideRoute(messages, images.length);
    const { provider, model, limits } = profile;

    log("INFO", "[ROUTER] Decision Made", {
      requestId,
      provider,
      model,
      taskType,
      reasoning,
      imageCount: images.length
    });

    log("INFO", `[${provider.toUpperCase()}] Using limits`, {
      taskType,
      maxOutputTokens: limits.maxOutputTokens,
      timeoutMs: limits.timeoutMs,
      temperature: limits.temperature,
      model
    });

    const domainContext = await getDomainContext(user.id);
    let anthropicSystemPrompt = domainContext || "You are a helpful AI assistant.";

    const apiPayload = formatMessagesForProvider(provider, messages, images);

    supabaseAdmin.from('ai_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: lastUserMessage.content,
      metadata: {
        image_count: images.length,
        has_images: images.length > 0,
        mode: mode || 'chat'
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
          const streamStartTime = performance.now();
          const STREAM_TIMEOUT_MS = 180000;
          let lastChunkTime = performance.now();

          while (true) {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Stream read timeout')), 30000)
            );

            const readPromise = reader.read();

            let result;
            try {
              result = await Promise.race([readPromise, timeoutPromise]);
            } catch (timeoutError) {
              log("ERROR", "[STREAM-TIMEOUT] Stream read timed out", {
                requestId,
                provider: streamProvider,
                elapsedMs: performance.now() - streamStartTime,
                timeSinceLastChunk: performance.now() - lastChunkTime
              });
              throw new Error(`Stream read timeout after 30 seconds of inactivity`);
            }

            const { done, value } = result as { done: boolean; value?: Uint8Array };
            if (done) break;

            lastChunkTime = performance.now();
            const chunk = decoder.decode(value);
            assistantResponseText += chunk;

            sendSSE(controller, {
              type: 'text',
              content: chunk
            });

            if (performance.now() - streamStartTime > STREAM_TIMEOUT_MS) {
              log("ERROR", "[STREAM-TIMEOUT] Total stream time exceeded", {
                requestId,
                provider: streamProvider,
                elapsedMs: performance.now() - streamStartTime
              });
              throw new Error(`Stream exceeded maximum duration of ${STREAM_TIMEOUT_MS}ms`);
            }
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
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    log("ERROR", "[REQUEST] Request failed", {
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});