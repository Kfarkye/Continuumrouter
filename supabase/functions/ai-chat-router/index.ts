import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { corsHeaders } from './_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
});

let env: z.infer<typeof EnvSchema>;
try {
    env = EnvSchema.parse(Deno.env.toObject());
} catch (error) {
    console.error("[INIT] FATAL: Invalid environment configuration.", (error as z.ZodError).errors);
    throw new Error("Configuration Error: Invalid environment variables.");
}

const CONFIG = {
  API_CONNECT_TIMEOUT_MS: 30000,
  STREAM_INACTIVITY_TIMEOUT_MS: 30000,
  STREAM_TOTAL_TIMEOUT_MS: 180000,
  MAX_RETRIES: 3,
  IMAGE_BUCKET_NAME: 'chat-uploads',
} as const;

const RequestBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).nonempty(),
  conversationId: z.string().uuid().optional(),
  imageIds: z.array(z.string().uuid()).optional(),
  mode: z.string().optional(),
});

type ChatMessage = z.infer<typeof RequestBodySchema>['messages'][0];

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});
const encoder = new TextEncoder();

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[env.LOG_LEVEL];

function log(level: keyof typeof LOG_LEVELS, message: string, meta: Record<string, unknown> = {}) {
  if (LOG_LEVELS[level] >= CURRENT_LOG_LEVEL) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta }));
  }
}

log("INFO", "[INIT] AI Chat Router Initializing.");

class AppError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = this.constructor.name;
  }
}
class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400);
  }
}
class AuthError extends AppError {
  constructor(message = "Authentication failed.") {
    super(message, 401);
  }
}
class ProviderError extends AppError {
  constructor(public provider: string, public upstreamStatus: number, message: string) {
    super(`${provider} API error: ${message}`, 502);
  }
}
class TimeoutError extends AppError {
    constructor(message: string) {
        super(message, 504);
    }
}

type Provider = 'anthropic' | 'openai' | 'gemini';

interface RouteProfile {
  provider: Provider;
  model: string;
  maxTokens: number;
  enabled: boolean;
}

const ROUTER_CONFIG: Record<string, RouteProfile> = {
  'anthropic': {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20240620',
    maxTokens: 8000,
    enabled: !!env.ANTHROPIC_API_KEY,
  },
  'openai': {
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 8000,
    enabled: !!env.OPENAI_API_KEY,
  },
  'gemini': {
    provider: 'gemini',
    model: 'gemini-1.5-pro-latest',
    maxTokens: 8000,
    enabled: !!env.GEMINI_API_KEY,
  }
};

const DEFAULT_MODEL_KEY = 'gemini';

function decideRoute(messages: ChatMessage[], imageCount: number): { taskType: string; profile: RouteProfile; reasoning: string } {
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage.content.toLowerCase();

  const getProfile = (key: string, reason: string) => {
    let profile = ROUTER_CONFIG[key];
    if (profile && profile.enabled) {
        return { taskType: reason.split(' ')[0].toLowerCase(), profile, reasoning: reason + ` Routed to ${profile.provider}.` };
    }

    log("WARN", `[ROUTER] Preferred provider ${key} is disabled. Attempting fallback.`);

    const fallbackKeys = [DEFAULT_MODEL_KEY, 'openai', 'anthropic', 'gemini'].filter((k, i, arr) => k !== key && arr.indexOf(k) === i);

    for (const fallbackKey of fallbackKeys) {
        profile = ROUTER_CONFIG[fallbackKey];
        if (profile && profile.enabled) {
            return { taskType: reason.split(' ')[0].toLowerCase(), profile, reasoning: reason + ` Fallback to ${profile.provider}.` };
        }
    }

    throw new AppError("Service Unavailable: No AI providers are currently enabled.", 503);
  };

  if (imageCount > 0) {
    return getProfile('anthropic', `Vision task with ${imageCount} images.`);
  }

  const codeWords = ['code', 'function', 'debug', 'implement', 'algorithm', 'typescript', 'error', 'bug'];
  if (codeWords.some(word => userText.includes(word))) {
    return getProfile('anthropic', 'Code-related task.');
  }

  const creativeWords = ['write', 'story', 'poem', 'creative', 'blog', 'draft'];
  if (creativeWords.some(word => userText.includes(word))) {
    return getProfile('openai', 'Creative writing task.');
  }

  return getProfile(DEFAULT_MODEL_KEY, 'General conversation.');
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxRetries: number = CONFIG.MAX_RETRIES,
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) {
        log("ERROR", "[RETRY] Operation failed after max retries or non-retriable error", { attempt, error: (error as Error).message });
        throw error;
      }
      const delay = Math.pow(2, attempt - 1) * 500 + Math.random() * 500;
      log("WARN", "[RETRY] Operation failed (transient), retrying...", { attempt, delayMs: Math.round(delay) });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const shouldRetryApiCall = (error: unknown): boolean => {
  if (error instanceof ProviderError) {
    return error.upstreamStatus === 429 || error.upstreamStatus >= 500;
  }
  return error instanceof TypeError || error instanceof TimeoutError;
};

async function processStream(response: Response, parser: (data: string) => string | null, provider: Provider): Promise<ReadableStream> {
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
            log("ERROR", `[STREAM] Fatal error processing chunk from ${provider}`, { error: (e as Error).message });
            controller.error(e);
            return;
          }
        }
      }
    }
  });
}

async function callProviderAPI(profile: RouteProfile, payload: any, systemPrompt?: string): Promise<ReadableStream> {
    const { provider, model, maxTokens } = profile;

    return retryOperation(async () => {
        let response: Response;
        let parser: (data: string) => string | null;

        const signal = AbortSignal.timeout(CONFIG.API_CONNECT_TIMEOUT_MS);

        try {
            switch (provider) {
                case 'anthropic':
                    if (!env.ANTHROPIC_API_KEY) throw new Error("Anthropic API Key Missing");
                    response = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': env.ANTHROPIC_API_KEY,
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({ model, max_tokens: maxTokens, messages: payload, stream: true, system: systemPrompt }),
                        signal
                    });
                    parser = (data) => {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                            return parsed.delta.text;
                        }
                        if (parsed.type === 'error') {
                             throw new Error(`Anthropic Stream Error: ${parsed.error?.message}`);
                        }
                        return null;
                    };
                    break;

                case 'openai':
                    if (!env.OPENAI_API_KEY) throw new Error("OpenAI API Key Missing");
                    response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
                        },
                        body: JSON.stringify({ model, messages: payload, stream: true, max_tokens: maxTokens }),
                        signal
                    });
                    parser = (data) => {
                        const parsed = JSON.parse(data);
                        return parsed?.choices?.[0]?.delta?.content || null;
                    };
                    break;

                case 'gemini':
                    if (!env.GEMINI_API_KEY) throw new Error("Gemini API Key Missing");
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${env.GEMINI_API_KEY}&alt=sse`;
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: payload,
                            generationConfig: { maxOutputTokens: maxTokens }
                        }),
                        signal
                    });
                    parser = (data) => {
                        const parsed = JSON.parse(data);
                        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text && parsed?.promptFeedback?.blockReason) {
                            throw new Error(`Gemini blocked the response due to: ${parsed.promptFeedback.blockReason}`);
                        }
                         if (parsed?.candidates?.[0]?.finishReason === 'SAFETY') {
                            throw new Error("The response was stopped early due to safety concerns.");
                        }
                        return text || null;
                    };
                    break;
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                throw new TimeoutError(`API connection timed out after ${CONFIG.API_CONNECT_TIMEOUT_MS}ms`);
            }
            throw error;
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => "Failed to read error body");
            throw new ProviderError(provider, response.status, errorText);
        }

        return processStream(response, parser, provider);

    }, shouldRetryApiCall, CONFIG.MAX_RETRIES);
}

function sendSSE(controller: ReadableStreamDefaultController, data: Record<string, unknown>) {
  try {
    const jsonData = JSON.stringify(data);
    controller.enqueue(encoder.encode(`data: ${jsonData}\n\n`));
  } catch (e) {
    log("WARN", "[SSE] Failed to send SSE event (controller potentially closed).");
  }
}

async function getDomainContext(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('clinician_profiles')
      .select('full_name, specialty')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) return null;
    return `User Context: Healthcare recruiter managing clinician ${data.full_name}. Specialty: ${data.specialty || 'N/A'}.`;
  } catch (error) {
    log("ERROR", "[CONTEXT] Error fetching domain context", { error: (error as Error).message });
    return null;
  }
}

async function fetchAndEncodeImages(imageIds: string[], userId: string): Promise<any[]> {
  if (!imageIds || imageIds.length === 0) return [];

  const { data: imageRecords, error } = await supabaseAdmin
    .from('uploaded_images')
    .select('id, mime_type, storage_path')
    .in('id', imageIds)
    .eq('user_id', userId);

  if (error || !imageRecords || imageRecords.length === 0) {
    log("ERROR", "[IMAGES] Failed to fetch image records or unauthorized", { error: error?.message });
    return [];
  }

  const downloadPromises = imageRecords.map(async (record) => {
    if (!record.storage_path || !record.mime_type) return null;

    const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!VALID_MIME_TYPES.includes(record.mime_type)) {
        log("WARN", "[IMAGES] Security: Unsupported MIME type detected", { mime: record.mime_type, id: record.id });
        return null;
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CONFIG.IMAGE_BUCKET_NAME)
      .download(record.storage_path);

    if (downloadError || !fileData) {
      log("ERROR", `[IMAGES] Failed to download image ${record.id}`, { error: downloadError?.message });
      return null;
    }

    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(arrayBuffer);
      return {
          media_type: record.mime_type,
          data: base64
      };
    } catch (error) {
      log("ERROR", `[IMAGES] Failed to encode image ${record.id}`);
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  return results.filter(Boolean);
}

function formatMessagesForProvider(
  provider: Provider,
  messages: ChatMessage[],
  images: any[]
): any[] {

  const filteredMessages = messages.filter(msg => {
      if (provider === 'anthropic' || provider === 'gemini') {
          return msg.role !== 'system';
      }
      return true;
  });

  return filteredMessages.map((msg: ChatMessage, idx: number) => {
      const isLastMessage = idx === filteredMessages.length - 1;
      const role = provider === 'gemini' ? (msg.role === 'assistant' ? 'model' : 'user') : msg.role;

      if (msg.role === 'user' && isLastMessage && images.length > 0) {
        const contentArray: any[] = [];

        if (msg.content) {
            if (provider === 'gemini') {
                contentArray.push({ text: msg.content });
            } else {
                contentArray.push({ type: 'text', text: msg.content });
            }
        }

        images.forEach(img => {
            if (provider === 'anthropic') {
                contentArray.push({
                    type: 'image',
                    source: { type: 'base64', media_type: img.media_type, data: img.data }
                });
            } else if (provider === 'openai') {
                contentArray.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.media_type};base64,${img.data}`, detail: 'auto' }
                });
            } else if (provider === 'gemini') {
                contentArray.push({
                    inlineData: { mimeType: img.media_type, data: img.data }
                });
            }
        });

        return provider === 'gemini' ? { role, parts: contentArray } : { role, content: contentArray };
      }

      if (provider === 'gemini') {
        return { role, parts: [{ text: msg.content }] };
      }
      return { role, content: msg.content };
  });
}

function persistMessage(supabase: SupabaseClient, requestId: string, messageData: Record<string, unknown>) {
    supabase.from('ai_messages').insert(messageData)
    .then(({ error }) => {
        if (error) log("ERROR", "[DB-ASYNC] Failed to persist message", { requestId, error: error.message });
    }).catch(err => {
        log("ERROR", "[DB-ASYNC] Unexpected error during persistence", { requestId, error: err.message });
    });
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const requestStartTime = performance.now();

  log("INFO", "[REQUEST] Incoming Request", { method: req.method, requestId });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new AuthError("Authorization header missing.");
    const token = authHeader.replace('Bearer ', '');

    const authPromise = supabaseAdmin.auth.getUser(token);
    const bodyPromise = req.json().catch(() => { throw new ValidationError("Invalid JSON payload.") });

    const [authResult, rawBody] = await Promise.all([authPromise, bodyPromise]);

    if (authResult.error || !authResult.data.user) {
        throw new AuthError();
    }
    const user = authResult.data.user;

    const validationResult = RequestBodySchema.safeParse(rawBody);
     if (!validationResult.success) {
      throw new ValidationError("Invalid request structure.", validationResult.error.issues);
    }
    const { messages, conversationId, imageIds, mode } = validationResult.data;

    const lastUserMessage = messages[messages.length - 1];

    const searchTriggers = [/^search[: ]/i, /^find[: ]/i, /what (is|are) the latest/i, /current (news|events)/i];
    if (searchTriggers.some(trigger => trigger.test(lastUserMessage.content))) {
      log("INFO", "[ROUTER] Search query detected", { requestId });
      return await handleSearchQuery({
        query: lastUserMessage.content,
        conversationId,
        userId: user.id,
        messages,
        supabase: supabaseAdmin,
        corsHeaders,
        userToken: token
      });
    }

    const [images, domainContext] = await Promise.all([
        fetchAndEncodeImages(imageIds || [], user.id),
        getDomainContext(user.id)
    ]);

    const { taskType, profile, reasoning } = decideRoute(messages, images.length);
    const { provider, model } = profile;

    log("INFO", "[ROUTER] Decision Made", { requestId, provider, model, taskType, reasoning });

    const systemPrompt = domainContext || "You are a helpful AI assistant.";
    const apiPayload = formatMessagesForProvider(provider, messages, images);

    if (conversationId) {
        persistMessage(supabaseAdmin, requestId, {
            conversation_id: conversationId,
            role: 'user',
            user_id: user.id,
            content: lastUserMessage.content,
            metadata: { image_count: images.length, mode: mode || 'chat' }
        });
    }

    const stream = new ReadableStream({
      async start(controller) {
        let ttftMs = 0;
        let firstChunkReceived = false;
        let assistantResponseText = '';

        try {
          sendSSE(controller, { type: 'metadata', provider, model, taskType, reasoning });

          const apiStream = await callProviderAPI(profile, apiPayload, systemPrompt);

          const reader = apiStream.getReader();
          const decoder = new TextDecoder();
          const streamStartTime = performance.now();
          let lastChunkTime = performance.now();

          while (true) {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new TimeoutError('Stream inactivity timeout')), CONFIG.STREAM_INACTIVITY_TIMEOUT_MS)
            );

            const readPromise = reader.read();
            let result;

            try {
              result = await Promise.race([readPromise, timeoutPromise]);
            } catch (timeoutError) {
              log("ERROR", "[STREAM-TIMEOUT] Inactivity detected (stream stalled)", {
                requestId, provider, timeSinceLastChunk: performance.now() - lastChunkTime
              });
              throw timeoutError;
            }

            const { done, value } = result as { done: boolean; value?: Uint8Array };
            if (done) break;

            lastChunkTime = performance.now();
            const chunk = decoder.decode(value);
            assistantResponseText += chunk;

            if (!firstChunkReceived) {
                firstChunkReceived = true;
                ttftMs = performance.now() - requestStartTime;
                log("INFO", "[PERFORMANCE] TTFT", { requestId, ttftMs: Math.round(ttftMs), provider });
            }

            sendSSE(controller, { type: 'text', content: chunk });

            if (performance.now() - streamStartTime > CONFIG.STREAM_TOTAL_TIMEOUT_MS) {
              log("ERROR", "[STREAM-TIMEOUT] Total duration exceeded", { requestId, provider });
              throw new TimeoutError(`Stream exceeded maximum duration of ${CONFIG.STREAM_TOTAL_TIMEOUT_MS}ms`);
            }
          }

          sendSSE(controller, { type: 'done' });

        } catch (error) {
          const errorMessage = (error as Error).message;
          log("ERROR", "[STREAM] Critical error during streaming", {
            requestId, provider, error: errorMessage, stack: (error as Error).stack
          });

          try {
            const errorType = error instanceof TimeoutError ? 'timeout' : (error instanceof ProviderError ? 'provider_error' : 'internal_error');
            sendSSE(controller, {
              type: 'error',
              errorType: errorType,
              content: `An error occurred: ${errorMessage}`
            });
          } catch (e) {
          }
        } finally {
            try {
                controller.close();
            } catch (e) {
            }

            if (assistantResponseText.trim() && conversationId) {
                const durationMs = performance.now() - requestStartTime;
                persistMessage(supabaseAdmin, requestId, {
                    conversation_id: conversationId,
                    role: 'assistant',
                    user_id: user.id,
                    content: assistantResponseText,
                    model: model,
                    task_type: taskType,
                    metadata: { duration_ms: durationMs, ttft_ms: ttftMs, provider, router_reasoning: reasoning }
                });
            }

             log("INFO", "[REQUEST] Request finalized.", { requestId, durationMs: performance.now() - requestStartTime });
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-ID': requestId
      }
    });

  } catch (error) {
    log("ERROR", "[REQUEST] Request failed synchronously", {
      requestId,
      error: (error as Error).message,
      stack: (error as Error).stack
    });

    let status = 500;
    let message = "Internal Server Error";
    let details = undefined;

    if (error instanceof AppError) {
        status = error.status;
        message = error.message;
        if (error instanceof ValidationError) {
            details = error.details;
        }
    }

    return new Response(
      JSON.stringify({ error: message, details, requestId }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': requestId } }
    );
  }
});