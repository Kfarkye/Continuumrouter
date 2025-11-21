import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from './_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

const env = Deno.env.toObject();

const CONFIG = {
  API_TIMEOUT_MS: 180000,
  MAX_TOKENS_DEFAULT: 6000,
  IMAGE_BUCKET_NAME: 'chat-uploads',
  SEARCH_TIMEOUT_MS: 3000,
  MOBILE_STREAM_TIMEOUT_MS: 120000,
  CHUNK_READ_TIMEOUT_MS: 20000
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

const LANE_PERSONAS: Record<string, string> = {
  code: `You are a senior software engineer with expertise in TypeScript, React, and modern web architecture. Provide production-ready code with error handling. Focus on best practices, performance, and maintainability.`,
  sports: `You are a sports betting analyst with expertise in statistical analysis and historical trends. Provide data-driven insights on betting lines, point spreads, over/under predictions, and game analysis. Focus on objective statistical analysis over speculation. Reference specific stats, historical patterns, and relevant trends when available.`,
  creative: `You are a creative writing assistant. Help with storytelling, character development, and narrative structure. Maintain consistent tone and focus on engaging, imaginative content.`,
  vision: `You are a visual analysis expert. Describe images thoroughly, noting important details, context, and actionable insights. Answer questions about visual content with precision.`,
  general: '',
};

interface TaskRouteResult {
  taskType: string;
  profile: RouteProfile;
  reasoning: string;
  agentName: string;
  intentDetected: string;
  confidence: number;
  handoffSummary: string;
}

function decideRoute(messages: any[], imageCount: number, requestId: string): TaskRouteResult {
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage?.content?.toLowerCase() || '';

  const DEBUG_ROUTING = env.DEBUG_ROUTING === 'true';

  if (DEBUG_ROUTING) {
    log("DEBUG", "[ROUTER-CLASSIFY] Analyzing message", {
      requestId,
      messagePreview: userText.substring(0, 100),
      hasImages: imageCount > 0
    });
  }

  if (imageCount > 0) {
    const profile = ROUTER_CONFIG['gemini'];
    return {
      taskType: 'vision',
      profile,
      reasoning: `Image analysis required - routing to Gemini Vision`,
      agentName: 'Vision Specialist',
      intentDetected: 'image_analysis',
      confidence: 0.95,
      handoffSummary: `Analyzing ${imageCount} image${imageCount > 1 ? 's' : ''} with advanced vision capabilities`
    };
  }

  const codePatterns = [
    /\bcode\b/i, /\bfunction\b/i, /\bapi\b/i, /\bdebug\b/i, /\bbug\b/i,
    /\berror\b/i, /\bfix\b/i, /\bimplement\b/i, /\brefactor\b/i, /\breact\b/i,
    /\btypescript\b/i, /\bjavascript\b/i, /\bcomponent\b/i, /\bhook\b/i,
    /\balgorithm\b/i, /\bdata structure\b/i, /\boptimiz/i
  ];

  const codeScore = codePatterns.filter(p => p.test(userText)).length;

  if (codeScore >= 2) {
    const profile = ROUTER_CONFIG['anthropic'];
    return {
      taskType: 'code',
      profile,
      reasoning: `Code-related query detected (score: ${codeScore}) - routing to Claude`,
      agentName: 'Senior Engineer',
      intentDetected: 'technical_implementation',
      confidence: Math.min(0.7 + (codeScore * 0.1), 0.95),
      handoffSummary: `Handling technical implementation task with production-grade code standards`
    };
  }

  const creativePatterns = [
    /\bwrite\b.*\bstory\b/i, /\bcreate\b.*\bcharacter\b/i, /\bplot\b/i,
    /\bnarrative\b/i, /\bscript\b/i, /\bdialogue\b/i, /\bnovel\b/i,
    /\bpoem\b/i, /\bcreative writing\b/i
  ];

  const creativeScore = creativePatterns.filter(p => p.test(userText)).length;

  if (creativeScore >= 1) {
    const profile = ROUTER_CONFIG['openai'];
    return {
      taskType: 'creative',
      profile,
      reasoning: `Creative writing detected - routing to GPT-4`,
      agentName: 'Creative Assistant',
      intentDetected: 'creative_writing',
      confidence: 0.8,
      handoffSummary: `Crafting creative content with focus on narrative and character development`
    };
  }

  const profile = ROUTER_CONFIG[DEFAULT_MODEL_KEY];
  return {
    taskType: 'general',
    profile,
    reasoning: 'General conversation - using default model',
    agentName: 'General Assistant',
    intentDetected: 'general_query',
    confidence: 0.6,
    handoffSummary: 'Handling general query with balanced capabilities'
  };
}

function processStream(response: Response, parser: (data: string) => string | null, providerName: string): ReadableStream {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const text = parser(buffer);
            if (text) controller.enqueue(encoder.encode(text));
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            const text = parser(data);
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
      } catch (error) {
        log("ERROR", `[${providerName}-STREAM] Error processing stream`, {
          error: (error as Error).message
        });
        controller.error(error);
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
      messages,
      max_tokens: CONFIG.MAX_TOKENS_DEFAULT,
      stream: true,
      ...(systemPrompt && { system: systemPrompt })
    }),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status}. ${errorText}`);
  }

  const parser = (data: string): string | null => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text;
      }
      return null;
    } catch {
      return null;
    }
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
      max_tokens: CONFIG.MAX_TOKENS_DEFAULT,
      stream: true
    }),
    signal: AbortSignal.timeout(CONFIG.API_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status}. ${errorText}`);
  }

  const parser = (data: string): string | null => {
    try {
      const parsed = JSON.parse(data);
      return parsed.choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
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
    try {
      const parsed = JSON.parse(data);
      return parsed?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {
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

  if (error || !imageRecords) {
    log("ERROR", "[IMAGES] Failed to fetch image records", { error: error?.message });
    return [];
  }

  const downloadPromises = imageRecords.map(async (record) => {
    try {
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from(CONFIG.IMAGE_BUCKET_NAME)
        .download(record.storage_path);

      if (downloadError || !fileData) {
        log("ERROR", "[IMAGES] Failed to download image", {
          imageId: record.id,
          error: downloadError?.message
        });
        return null;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        inline_data: {
          mime_type: record.mime_type,
          data: base64
        }
      };
    } catch (err) {
      log("ERROR", "[IMAGES] Exception processing image", {
        imageId: record.id,
        error: (err as Error).message
      });
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  return results.filter((img): img is NonNullable<typeof img> => img !== null);
}

function formatMessages(
  messages: any[],
  provider: 'anthropic' | 'openai' | 'gemini',
  images: any[],
  domainContext?: string | null
): any[] {
  if (provider === 'anthropic' || provider === 'openai') {
    return messages.map((msg: any, index: number) => {
      if (images.length > 0 && index === messages.length - 1 && msg.role === 'user') {
        return {
          role: 'user',
          content: [
            ...(domainContext ? [{ type: 'text', text: domainContext }] : []),
            { type: 'text', text: msg.content },
            ...images.map(img => ({
              type: 'image',
              source: img.inline_data
            }))
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
        corsHeaders,
        userToken: token
      });
    }

    const startTime = performance.now();

    const images = await fetchAndEncodeImages(imageIds || [], user.id);

    const { taskType, profile, reasoning, agentName, intentDetected, confidence, handoffSummary } = decideRoute(messages, images.length, requestId);
    const { provider, model, limits } = profile;

    log("INFO", "[ROUTER] Decision Made", {
      requestId,
      provider,
      model,
      taskType,
      confidence,
      reasoning
    });

    const domainContext = await getDomainContext(user.id);
    const apiPayload = formatMessages(messages, provider, images, domainContext);

    const anthropicSystemPrompt = provider === 'anthropic' ? LANE_PERSONAS[taskType] : undefined;

    let streamProvider = provider;
    let streamModel = model;

    supabaseAdmin.from('ai_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: lastUserMessage.content,
      model: 'user-input',
      task_type: taskType
    }).then(({ error }) => {
      if (error) {
        log("ERROR", "[DB-ASYNC] Failed to persist user message", {
          requestId,
          error: error.message
        });

        if (error.code === '23503') {
          log("ERROR", "[DB-ASYNC] Foreign Key constraint violation detected!", {
            requestId,
            conversationId,
            hint: "The conversation_id does not exist in ai_conversations table",
            error: error.message
          });
        }
      }
    });

    const stream = new ReadableStream({
      async start(controller) {
        let streamProvider = provider;
        let keepaliveInterval: number | null = null;

        try {
          keepaliveInterval = setInterval(() => {
            try {
              sendSSE(controller, { type: 'keepalive' });
            } catch (e) {
            }
          }, 15000);

          sendSSE(controller, {
            type: 'router_decision',
            agent: agentName,
            intent: intentDetected,
            confidence,
            handoffSummary,
            provider,
            model
          });

          sendSSE(controller, {
            type: 'model_switch',
            provider,
            model,
            metadata: { taskType, reasoning, agentName, intentDetected, confidence, handoffSummary }
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
          let chunkCount = 0;

          sendSSE(controller, {
            type: 'status',
            state: 'streaming',
            provider: streamProvider,
            model: streamModel
          });

          while (true) {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Stream read timeout')), CONFIG.CHUNK_READ_TIMEOUT_MS)
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
                timeSinceLastChunk: performance.now() - lastChunkTime,
                chunksReceived: chunkCount,
                partialContent: assistantResponseText.length
              });

              if (assistantResponseText.trim()) {
                sendSSE(controller, {
                  type: 'warning',
                  content: ' [Stream interrupted - response may be incomplete]'
                });
                break;
              }
              throw new Error(`Stream read timeout after ${CONFIG.CHUNK_READ_TIMEOUT_MS}ms of inactivity`);
            }

            const { done, value } = result as { done: boolean; value?: Uint8Array };
            if (done) break;

            lastChunkTime = performance.now();
            chunkCount++;
            const chunk = decoder.decode(value);
            assistantResponseText += chunk;

            sendSSE(controller, {
              type: 'text',
              content: chunk
            });

            if (chunkCount % 50 === 0) {
              sendSSE(controller, {
                type: 'heartbeat',
                chunks: chunkCount
              });
            }

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

          if (keepaliveInterval) clearInterval(keepaliveInterval);

          controller.close();
          log("INFO", "[REQUEST] Stream completed successfully", {
            requestId,
            durationMs: performance.now() - startTime,
            totalChunks: chunkCount
          });
        } catch (error) {
          const errorMessage = (error as Error).message;
          const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
          const isNetworkError = errorMessage.includes('network') || errorMessage.includes('fetch');

          log("ERROR", "[STREAM] Error during API streaming", {
            requestId,
            provider: streamProvider,
            error: errorMessage,
            isTimeout,
            isNetworkError,
            partialContent: assistantResponseText?.length || 0,
            stack: (error as Error).stack
          });

          if (assistantResponseText && assistantResponseText.trim().length > 50) {
            const durationMs = performance.now() - startTime;
            supabaseAdmin.from('ai_messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: assistantResponseText + '\n\n[Response interrupted]',
              model: model,
              task_type: taskType,
              metadata: {
                duration_ms: durationMs,
                provider: provider,
                interrupted: true,
                error: errorMessage
              }
            }).then(({ error: dbError }) => {
              if (dbError) log("ERROR", "[DB-ASYNC] Failed to persist partial message", {
                requestId,
                error: dbError.message
              });
            });
          }

          if (keepaliveInterval) clearInterval(keepaliveInterval);

          try {
            sendSSE(controller, {
              type: 'error',
              content: `Stream error: ${(error as Error).message}`
            });
          } catch (sendError) {
            log("ERROR", "[SSE] Failed to send error event", {
              requestId,
              error: (sendError as Error).message
            });
          }

          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId
      }
    });

  } catch (error) {
    log("ERROR", "[REQUEST] Fatal error", {
      error: (error as Error).message,
      stack: (error as Error).stack
    });

    return new Response(JSON.stringify({
      error: (error as Error).message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
