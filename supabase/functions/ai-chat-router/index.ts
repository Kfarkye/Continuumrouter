import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { corsHeaders } from './_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  ENABLE_CIRCUIT_BREAKER: z.coerce.boolean().default(true),
  ENABLE_REQUEST_DEDUPLICATION: z.coerce.boolean().default(true),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

let env: z.infer<typeof EnvSchema>;
try {
  env = EnvSchema.parse(Deno.env.toObject());
} catch (error) {
  console.error("[INIT] FATAL: Invalid environment configuration.", (error as z.ZodError).errors);
  throw new Error("Configuration Error: Invalid environment variables.");
}

const CONFIG = {
  API_CONNECT_TIMEOUT_MS: 15000,
  STREAM_INACTIVITY_TIMEOUT_MS: 25000,
  STREAM_TOTAL_TIMEOUT_MS: 180000,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 500,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  MAX_MESSAGE_LENGTH: 50000,
  MAX_MESSAGES_COUNT: 100,
  MAX_IMAGE_COUNT: 10,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  IMAGE_BUCKET_NAME: 'chat-uploads',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  DEDUP_WINDOW_MS: 5000,
} as const;

const RequestBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(CONFIG.MAX_MESSAGE_LENGTH),
  })).nonempty().max(CONFIG.MAX_MESSAGES_COUNT),
  conversationId: z.string().uuid().optional(),
  imageIds: z.array(z.string().uuid()).max(CONFIG.MAX_IMAGE_COUNT).optional(),
  mode: z.enum(['chat', 'search_assist']).optional().default('chat'),
});

type ChatMessage = z.infer<typeof RequestBodySchema>['messages'][0];

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const encoder = new TextEncoder();

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[env.LOG_LEVEL];

interface LogContext extends Record<string, unknown> {
  requestId?: string;
  userId?: string;
  provider?: string;
  traceId?: string;
  spanId?: string;
}

function log(level: keyof typeof LOG_LEVELS, message: string, meta: LogContext = {}) {
  if (LOG_LEVELS[level] >= CURRENT_LOG_LEVEL) {
    const logEntry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta
    };

    if (meta.error instanceof Error) {
      logEntry.error = {
        message: meta.error.message,
        name: meta.error.name,
        stack: meta.error.stack,
      };
      delete logEntry.error;
    }

    console.log(JSON.stringify(logEntry));
  }
}

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

function createTraceContext(parentSpan?: string): TraceContext {
  return {
    traceId: crypto.randomUUID(),
    spanId: crypto.randomUUID(),
    parentSpanId: parentSpan,
  };
}

class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();

  record(metric: string, value: number) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    const values = this.metrics.get(metric)!;
    values.push(value);

    if (values.length > 100) {
      values.shift();
    }
  }

  getPercentile(metric: string, percentile: number): number | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getAverage(metric: string): number | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) return null;

    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
}

const metrics = new MetricsCollector();

log("INFO", "[INIT] AI Chat Router Initializing.");

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, "VALIDATION_FAILED", false);
  }
}

class AuthError extends AppError {
  constructor(message = "Authentication failed.", code = "AUTH_FAILED", status = 401) {
    super(message, status, code, false);
  }
}

class ProviderError extends AppError {
  constructor(public provider: string, public upstreamStatus: number, message: string) {
    const retryable = upstreamStatus === 429 || upstreamStatus >= 500;
    super(`${provider} API error: ${message}`, 502, "UPSTREAM_API_ERROR", retryable);
  }
}

class TimeoutError extends AppError {
  constructor(message: string, code = "TIMEOUT") {
    super(message, 504, code, true);
  }
}

class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", false);
  }
}

class CircuitBreakerError extends AppError {
  constructor(provider: string) {
    super(`Circuit breaker open for ${provider}`, 503, "CIRCUIT_BREAKER_OPEN", true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN
// ═══════════════════════════════════════════════════════════════════════════

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private threshold: number,
    private timeout: number,
    private name: string
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!env.ENABLE_CIRCUIT_BREAKER) {
      return operation();
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        log("INFO", `[CIRCUIT-BREAKER] Transitioning to HALF_OPEN`, { circuit: this.name });
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new CircuitBreakerError(this.name);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        log("INFO", `[CIRCUIT-BREAKER] Closing circuit`, { circuit: this.name });
        this.state = CircuitState.CLOSED;
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      log("ERROR", `[CIRCUIT-BREAKER] Opening circuit`, {
        circuit: this.name,
        failures: this.failureCount
      });
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

const circuitBreakers = {
  anthropic: new CircuitBreaker(CONFIG.CIRCUIT_BREAKER_THRESHOLD, CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS, 'anthropic'),
  openai: new CircuitBreaker(CONFIG.CIRCUIT_BREAKER_THRESHOLD, CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS, 'openai'),
  gemini: new CircuitBreaker(CONFIG.CIRCUIT_BREAKER_THRESHOLD, CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS, 'gemini'),
};

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async checkLimit(userId: string): Promise<void> {
    if (!env.ENABLE_RATE_LIMITING) return;

    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;

    let userRequests = this.requests.get(userId) || [];

    userRequests = userRequests.filter(timestamp => timestamp > windowStart);

    if (userRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
      throw new RateLimitError(
        `Rate limit exceeded: ${CONFIG.RATE_LIMIT_MAX_REQUESTS} requests per ${CONFIG.RATE_LIMIT_WINDOW_MS / 1000}s`
      );
    }

    userRequests.push(now);
    this.requests.set(userId, userRequests);

    if (Math.random() < 0.01) {
      this.cleanup(windowStart);
    }
  }

  private cleanup(windowStart: number) {
    for (const [userId, requests] of this.requests.entries()) {
      const activeRequests = requests.filter(ts => ts > windowStart);
      if (activeRequests.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, activeRequests);
      }
    }
  }

  getRemainingRequests(userId: string): number {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
    const userRequests = this.requests.get(userId) || [];
    const activeRequests = userRequests.filter(ts => ts > windowStart);
    return Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - activeRequests.length);
  }
}

const rateLimiter = new RateLimiter();

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

interface PendingRequest {
  promise: Promise<Response>;
  timestamp: number;
}

class RequestDeduplicator {
  private pending: Map<string, PendingRequest> = new Map();

  createKey(userId: string, messages: ChatMessage[]): string {
    const lastMessage = messages[messages.length - 1];
    return `${userId}:${lastMessage.content.substring(0, 100)}`;
  }

  async deduplicate(
    key: string,
    operation: () => Promise<Response>
  ): Promise<Response> {
    if (!env.ENABLE_REQUEST_DEDUPLICATION) {
      return operation();
    }

    const now = Date.now();

    const existing = this.pending.get(key);
    if (existing && (now - existing.timestamp) < CONFIG.DEDUP_WINDOW_MS) {
      log("INFO", "[DEDUP] Returning cached pending request", { key });
      return existing.promise;
    }

    const promise = operation();
    this.pending.set(key, { promise, timestamp: now });

    promise.finally(() => {
      const entry = this.pending.get(key);
      if (entry && entry.timestamp === now) {
        this.pending.delete(key);
      }
    });

    return promise;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, request] of this.pending.entries()) {
      if (now - request.timestamp > CONFIG.DEDUP_WINDOW_MS) {
        this.pending.delete(key);
      }
    }
  }
}

const deduplicator = new RequestDeduplicator();

setInterval(() => deduplicator.cleanup(), 10000);

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE TIMEOUT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

class AdaptiveTimeout {
  getConnectionTimeout(provider: string): number {
    const p95 = metrics.getPercentile(`${provider}_connection_time`, 95);
    if (!p95) return CONFIG.API_CONNECT_TIMEOUT_MS;

    return Math.max(CONFIG.API_CONNECT_TIMEOUT_MS, p95 * 1.5);
  }

  getStreamTimeout(provider: string): number {
    const p95 = metrics.getPercentile(`${provider}_ttft`, 95);
    if (!p95) return CONFIG.STREAM_INACTIVITY_TIMEOUT_MS;

    return Math.max(CONFIG.STREAM_INACTIVITY_TIMEOUT_MS, p95 * 2);
  }
}

const adaptiveTimeout = new AdaptiveTimeout();

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

async function authenticateUser(token: string, trace: TraceContext): Promise<{ id: string, email?: string }> {
  const startTime = performance.now();

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new AuthError("Invalid or expired token", "AUTH_INVALID_TOKEN", 403);
    }

    metrics.record('auth_duration', performance.now() - startTime);
    return { id: data.user.id, email: data.user.email };

  } catch (error) {
    metrics.record('auth_duration', performance.now() - startTime);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

type Provider = 'anthropic' | 'openai' | 'gemini';

interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalCost?: number;
}

interface RouteProfile {
  provider: Provider;
  model: string;
  limits: {
    maxOutputTokens: number;
    timeoutMs: number;
    temperature: number;
  };
  enabled: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

interface TaskRouteResult {
  taskType: string;
  profile: RouteProfile;
  reasoning: string;
}

const ROUTER_CONFIG: Record<string, RouteProfile> = {
  'anthropic': {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7
    },
    enabled: !!env.ANTHROPIC_API_KEY,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  'openai': {
    provider: 'openai',
    model: 'gpt-4o',
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7
    },
    enabled: !!env.OPENAI_API_KEY,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  'gemini': {
    provider: 'gemini',
    model: 'gemini-3-pro-preview',
    limits: {
      maxOutputTokens: 6000,
      timeoutMs: 180000,
      temperature: 0.7
    },
    enabled: !!env.GEMINI_API_KEY,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.005,
  }
};

const DEFAULT_MODEL_KEY = 'gemini';

const CODE_WORDS = new Set(['code', 'function', 'debug', 'implement', 'algorithm', 'typescript', 'error', 'bug', 'api', 'sql', 'javascript', 'python', 'rust']);
const CREATIVE_WORDS = new Set(['write', 'story', 'poem', 'creative', 'blog', 'draft', 'idea', 'script', 'essay']);

function decideRoute(
  messages: ChatMessage[],
  imageCount: number,
  trace: TraceContext
): TaskRouteResult {

  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage.content.toLowerCase();

  const getProfile = (key: string, reason: string): TaskRouteResult => {
    let profile = ROUTER_CONFIG[key];

    if (profile && profile.enabled) {
      const breaker = circuitBreakers[profile.provider];
      if (breaker.getState() === CircuitState.OPEN) {
        log("WARN", `[ROUTER] Circuit breaker open for ${profile.provider}`, { traceId: trace.traceId });
        profile = undefined as any;
      }
    }

    if (profile && profile.enabled) {
      return {
        taskType: reason.split(' ')[0].toLowerCase(),
        profile,
        reasoning: `${reason} Routed to ${profile.provider} (${profile.model}).`
      };
    }

    log("WARN", `[ROUTER] Preferred provider ${key} unavailable. Attempting fallback.`, { traceId: trace.traceId });

    const fallbackKeys = [DEFAULT_MODEL_KEY, 'openai', 'anthropic', 'gemini']
      .filter((k, i, arr) => k !== key && arr.indexOf(k) === i);

    for (const fallbackKey of fallbackKeys) {
      profile = ROUTER_CONFIG[fallbackKey];
      if (profile && profile.enabled) {
        const breaker = circuitBreakers[profile.provider];
        if (breaker.getState() !== CircuitState.OPEN) {
          return {
            taskType: reason.split(' ')[0].toLowerCase(),
            profile,
            reasoning: `${reason} Fallback to ${profile.provider} (${profile.model}).`
          };
        }
      }
    }

    throw new AppError("Service Unavailable: No AI providers are currently enabled.", 503, "NO_PROVIDERS_AVAILABLE", false);
  };

  if (imageCount > 0) {
    return getProfile('anthropic', `Vision task with ${imageCount} images.`);
  }

  const words = userText.split(/\s+/);

  if (words.some(word => CODE_WORDS.has(word))) {
    return getProfile('anthropic', 'Code-related task.');
  }

  if (words.some(word => CREATIVE_WORDS.has(word))) {
    return getProfile('openai', 'Creative writing task.');
  }

  return getProfile(DEFAULT_MODEL_KEY, 'General conversation.');
}

// ═══════════════════════════════════════════════════════════════════════════
// RESILIENCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

async function retryOperation<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxRetries: number = CONFIG.MAX_RETRIES,
  trace?: TraceContext
): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await operation();
    } catch (error) {
      const isRetryable = shouldRetry(error);

      if (attempt >= maxRetries || !isRetryable) {
        log("ERROR", "[RETRY] Operation failed permanently.", {
          attempt,
          error,
          traceId: trace?.traceId
        });
        throw error;
      }

      const backoff = Math.pow(2, attempt - 1) * CONFIG.RETRY_BASE_DELAY_MS;
      const jitter = Math.random() * 500;
      const delay = backoff + jitter;

      log("WARN", "[RETRY] Operation failed (transient), retrying...", {
        attempt,
        delayMs: Math.round(delay),
        error,
        traceId: trace?.traceId
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

const shouldRetryApiCall = (error: unknown): boolean => {
  if (error instanceof AppError) {
    return error.retryable;
  }
  return error instanceof TypeError;
};

// ═══════════════════════════════════════════════════════════════════════════
// STREAM PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

type StreamParserResult = { chunk: string | null; usage: UsageMetrics | null };
type StreamParser = (data: string) => StreamParserResult;

function createSSEParser(
  parser: StreamParser,
  provider: Provider,
  trace: TraceContext
): { transformer: TransformStream<Uint8Array, string>; usagePromise: Promise<UsageMetrics> } {

  const decoder = new TextDecoder();
  let buffer = '';
  let metrics: UsageMetrics = { inputTokens: 0, outputTokens: 0 };

  let resolveUsage: (value: UsageMetrics) => void;
  const usagePromise = new Promise<UsageMetrics>((resolve) => {
    resolveUsage = resolve;
  });

  const transformer = new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const result = parser(data);

          if (result.usage) {
            metrics = result.usage;
          }

          if (result.chunk) {
            controller.enqueue(result.chunk);
          }
        } catch (e) {
          log("ERROR", `[STREAM] Fatal error processing chunk`, {
            provider,
            error: e,
            traceId: trace.traceId
          });
          controller.error(e);
          return;
        }
      }
    },
    flush() {
      resolveUsage(metrics);
    }
  });

  return { transformer, usagePromise };
}

// ═══════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function callProviderAPI(
  profile: RouteProfile,
  payload: unknown,
  systemPrompt: string | undefined,
  clientSignal: AbortSignal,
  trace: TraceContext
): Promise<{ stream: ReadableStream<string>; usagePromise: Promise<UsageMetrics> }> {

  const { provider, model, limits } = profile;
  const connectionStart = performance.now();

  return retryOperation(async () => {
    return circuitBreakers[provider].execute(async () => {
      let response: Response;
      let parser: StreamParser;

      const timeoutController = new AbortController();
      const connectionTimeout = adaptiveTimeout.getConnectionTimeout(provider);
      const timeoutError = new TimeoutError(
        `API connection timed out after ${connectionTimeout}ms`,
        "CONNECTION_TIMEOUT"
      );

      const timeoutId = setTimeout(() => timeoutController.abort(timeoutError), connectionTimeout);

      const compositeSignal = AbortSignal.any([clientSignal, timeoutController.signal]);

      try {
        switch (provider) {
          case 'anthropic':
            if (!env.ANTHROPIC_API_KEY) throw new Error("Anthropic API Key Missing");

            response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-trace-id': trace.traceId,
              },
              body: JSON.stringify({
                model,
                max_tokens: limits.maxOutputTokens,
                messages: payload,
                stream: true,
                system: systemPrompt
              }),
              signal: compositeSignal
            });

            parser = (data: string): StreamParserResult => {
              const parsed = JSON.parse(data);
              let chunk: string | null = null;
              let usage: UsageMetrics | null = null;

              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                chunk = parsed.delta.text;
              } else if (parsed.type === 'message_delta' && parsed.delta?.usage) {
                usage = {
                  inputTokens: 0,
                  outputTokens: parsed.delta.usage.output_tokens || 0
                };
              } else if (parsed.type === 'message_start' && parsed.message?.usage) {
                usage = {
                  inputTokens: parsed.message.usage.input_tokens || 0,
                  outputTokens: 0
                };
              } else if (parsed.type === 'error') {
                throw new Error(`Anthropic Stream Error: ${parsed.error?.message}`);
              }

              return { chunk, usage };
            };
            break;

          case 'openai':
            if (!env.OPENAI_API_KEY) throw new Error("OpenAI API Key Missing");

            response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                'X-Trace-Id': trace.traceId,
              },
              body: JSON.stringify({
                model,
                messages: payload,
                stream: true,
                max_tokens: limits.maxOutputTokens,
                stream_options: { include_usage: true }
              }),
              signal: compositeSignal
            });

            parser = (data: string): StreamParserResult => {
              const parsed = JSON.parse(data);
              let chunk: string | null = null;
              let usage: UsageMetrics | null = null;

              if (parsed?.choices?.[0]?.delta?.content) {
                chunk = parsed.choices[0].delta.content;
              }

              if (parsed.usage) {
                usage = {
                  inputTokens: parsed.usage.prompt_tokens || 0,
                  outputTokens: parsed.usage.completion_tokens || 0
                };
              }

              return { chunk, usage };
            };
            break;

          case 'gemini':
            if (!env.GEMINI_API_KEY) throw new Error("Gemini API Key Missing");

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${env.GEMINI_API_KEY}&alt=sse`;

            const geminiBody: Record<string, unknown> = {
              contents: payload,
              generationConfig: { maxOutputTokens: limits.maxOutputTokens }
            };

            if (systemPrompt) {
              geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
            }

            response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Trace-Id': trace.traceId,
              },
              body: JSON.stringify(geminiBody),
              signal: compositeSignal
            });

            parser = (data: string): StreamParserResult => {
              const parsed = JSON.parse(data);
              let chunk: string | null = null;
              let usage: UsageMetrics | null = null;

              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) chunk = text;

              if (parsed.usageMetadata) {
                usage = {
                  inputTokens: parsed.usageMetadata.promptTokenCount || 0,
                  outputTokens: parsed.usageMetadata.candidatesTokenCount || 0
                };
              }

              if (parsed?.promptFeedback?.blockReason) {
                throw new Error(`Gemini blocked: ${parsed.promptFeedback.blockReason}`);
              }

              if (parsed?.candidates?.[0]?.finishReason === 'SAFETY') {
                throw new Error("Response stopped due to safety concerns.");
              }

              return { chunk, usage };
            };
            break;

          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          if (clientSignal.aborted) {
            throw new AppError("Client disconnected during API connection.", 499, "CLIENT_DISCONNECTED", false);
          }
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
        metrics.record(`${provider}_connection_time`, performance.now() - connectionStart);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Failed to read error body");
        throw new ProviderError(provider, response.status, errorText);
      }

      if (!response.body) {
        throw new ProviderError(provider, 500, "No response body received.");
      }

      const { transformer, usagePromise } = createSSEParser(parser, provider, trace);
      const stream = response.body.pipeThrough(transformer);

      return { stream, usagePromise };
    });
  }, shouldRetryApiCall, CONFIG.MAX_RETRIES, trace);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sendSSE(controller: ReadableStreamDefaultController, eventType: string, data: Record<string, unknown> | string) {
  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${payload}\n\n`));
  } catch (e) {
    log("WARN", "[SSE] Failed to send SSE event (controller closed)");
  }
}

async function getDomainContext(userId: string, trace: TraceContext): Promise<string | null> {
  try {
    return await retryOperation(async () => {
      const { data, error } = await supabaseAdmin
        .from('clinician_profiles')
        .select('full_name, specialty')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return `User Context: Healthcare recruiter managing clinician ${data.full_name}. Specialty: ${data.specialty || 'N/A'}.`;
    }, (error) => {
      return !(error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('PGRST'));
    }, 2, trace);
  } catch (error) {
    log("ERROR", "[CONTEXT] Error fetching domain context", { error, traceId: trace.traceId });
    return null;
  }
}

const VALID_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function fetchAndEncodeImages(imageIds: string[], userId: string, trace: TraceContext): Promise<Array<{ media_type: string; data: string }>> {
  if (!imageIds || imageIds.length === 0) return [];

  const { data: imageRecords, error } = await supabaseAdmin
    .from('uploaded_images')
    .select('id, mime_type, storage_path, size')
    .in('id', imageIds)
    .eq('user_id', userId);

  if (error || !imageRecords || imageRecords.length === 0) {
    log("ERROR", "[IMAGES] Failed to fetch image records", { error, userId, traceId: trace.traceId });
    return [];
  }

  const downloadPromises = imageRecords.map(async (record) => {
    if (!record.storage_path || !record.mime_type) return null;

    if (!VALID_MIME_TYPES.has(record.mime_type)) {
      log("WARN", "[IMAGES] Unsupported MIME type", { mime: record.mime_type, id: record.id });
      return null;
    }

    if (record.size && record.size > CONFIG.MAX_IMAGE_SIZE_BYTES) {
      log("WARN", "[IMAGES] Image exceeds size limit (metadata)", { size: record.size, id: record.id });
      return null;
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CONFIG.IMAGE_BUCKET_NAME)
      .download(record.storage_path);

    if (downloadError || !fileData) {
      log("ERROR", `[IMAGES] Failed to download image`, { id: record.id, error: downloadError });
      return null;
    }

    if (fileData.size > CONFIG.MAX_IMAGE_SIZE_BYTES) {
      log("WARN", "[IMAGES] Downloaded image exceeds size limit", { size: fileData.size, id: record.id });
      return null;
    }

    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(arrayBuffer);
      return { media_type: record.mime_type, data: base64 };
    } catch (error) {
      log("ERROR", `[IMAGES] Failed to encode image`, { id: record.id, error });
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  return results.filter((r): r is { media_type: string; data: string } => r !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatMessagesForProvider(
  provider: Provider,
  messages: ChatMessage[],
  images: Array<{ media_type: string; data: string }>,
  systemPrompt?: string
): unknown {

  const filteredMessages = messages.filter(msg => {
    if (provider === 'anthropic' || provider === 'gemini') {
      return msg.role !== 'system';
    }
    return true;
  });

  if (provider === 'openai' && systemPrompt && !messages.some(m => m.role === 'system')) {
    filteredMessages.unshift({ role: 'system', content: systemPrompt });
  }

  return filteredMessages.map((msg: ChatMessage, idx: number) => {
    const isLastMessage = idx === filteredMessages.length - 1;
    const role = provider === 'gemini' ? (msg.role === 'assistant' ? 'model' : msg.role) : msg.role;

    if (msg.role === 'user' && isLastMessage && images.length > 0) {
      const contentArray: Array<Record<string, unknown>> = [];

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

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function persistMessage(requestId: string, messageData: Record<string, unknown>) {
  supabaseAdmin.from('ai_messages').insert(messageData)
    .then(({ error }) => {
      if (error) {
        log("ERROR", "[DB-ASYNC] Failed to persist message", { requestId, error });
      }
    })
    .catch(err => {
      log("ERROR", "[DB-ASYNC] Unexpected error during persistence", { requestId, error: err });
    });
}

function calculateCost(usage: UsageMetrics, profile: RouteProfile): number {
  const inputCost = (usage.inputTokens / 1000) * profile.costPer1kInput;
  const outputCost = (usage.outputTokens / 1000) * profile.costPer1kOutput;
  return inputCost + outputCost;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const requestStartTime = performance.now();
  const trace = createTraceContext();

  const requestController = new AbortController();
  req.signal.addEventListener('abort', () => {
    log("WARN", "[REQUEST] Client disconnected", { requestId, traceId: trace.traceId });
    requestController.abort("Client disconnected");
  });

  log("INFO", "[REQUEST] Incoming", {
    method: req.method,
    url: req.url,
    requestId,
    traceId: trace.traceId
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError("Authorization header missing or malformed", "AUTH_HEADER_INVALID");
    }
    const token = authHeader.substring(7);

    const authPromise = authenticateUser(token, trace);
    const bodyPromise = req.json().catch(() => {
      throw new ValidationError("Invalid JSON payload");
    });

    const [user, rawBody] = await Promise.all([authPromise, bodyPromise]);

    await rateLimiter.checkLimit(user.id);

    const validationResult = RequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      throw new ValidationError("Invalid request structure", validationResult.error.format());
    }
    const { messages, conversationId, imageIds, mode } = validationResult.data;

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.role !== 'user') {
      throw new ValidationError("Last message must be from user");
    }

    const searchTriggers = [/^search[: ]/i, /^find[: ]/i, /what (is|are) the latest/i];
    if (mode === 'search_assist' || searchTriggers.some(t => t.test(lastUserMessage.content))) {
      log("INFO", "[ROUTER] Search query detected", { requestId, traceId: trace.traceId });
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

    const dedupKey = deduplicator.createKey(user.id, messages);

    return await deduplicator.deduplicate(dedupKey, async () => {
      const [images, domainContext] = await Promise.all([
        fetchAndEncodeImages(imageIds || [], user.id, trace),
        getDomainContext(user.id, trace)
      ]);

      const { taskType, profile, reasoning } = decideRoute(messages, images.length, trace);
      const { provider, model } = profile;

      log("INFO", "[ROUTER] Decision", {
        requestId,
        provider,
        model,
        taskType,
        reasoning,
        traceId: trace.traceId
      });

      const systemPrompt = domainContext || "You are a helpful AI assistant.";
      const apiPayload = formatMessagesForProvider(provider, messages, images, systemPrompt);

      if (conversationId) {
        persistMessage(requestId, {
          conversation_id: conversationId,
          role: 'user',
          user_id: user.id,
          content: lastUserMessage.content,
          metadata: {
            image_count: images.length,
            mode,
            request_id: requestId,
            trace_id: trace.traceId
          }
        });
      }

      const stream = new ReadableStream({
        async start(controller) {
          let ttftMs = 0;
          let firstChunkReceived = false;
          let assistantResponseText = '';
          let finalUsage: UsageMetrics = { inputTokens: 0, outputTokens: 0 };
          let upstreamReader: ReadableStreamDefaultReader<string> | null = null;

          try {
            sendSSE(controller, 'metadata', {
              provider,
              model,
              taskType,
              reasoning,
              requestId,
              traceId: trace.traceId,
              rateLimitRemaining: rateLimiter.getRemainingRequests(user.id)
            });

            const { stream: apiStream, usagePromise } = await callProviderAPI(
              profile,
              apiPayload,
              systemPrompt,
              requestController.signal,
              trace
            );

            upstreamReader = apiStream.getReader();

            const streamStartTime = performance.now();
            let lastChunkTime = streamStartTime;
            const streamTimeout = adaptiveTimeout.getStreamTimeout(provider);

            while (true) {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new TimeoutError('Stream inactivity timeout', "STREAM_INACTIVITY")), streamTimeout)
              );

              const abortPromise = new Promise<never>((_, reject) => {
                if (requestController.signal.aborted) {
                  reject(new AppError("Client disconnected", 499, "CLIENT_DISCONNECTED", false));
                  return;
                }
                requestController.signal.addEventListener('abort', () => {
                  reject(new AppError("Client disconnected", 499, "CLIENT_DISCONNECTED", false));
                }, { once: true });
              });

              const readPromise = upstreamReader.read();
              let result: ReadableStreamReadResult<string>;

              try {
                result = await Promise.race([readPromise, timeoutPromise, abortPromise]) as ReadableStreamReadResult<string>;
              } catch (error) {
                if (error instanceof AppError && error.code === "CLIENT_DISCONNECTED") {
                  log("WARN", "[STREAM] Client disconnected", { requestId, traceId: trace.traceId });
                } else {
                  log("ERROR", "[STREAM] Timeout", { requestId, provider, traceId: trace.traceId });
                }
                upstreamReader.cancel().catch(() => {});
                throw error;
              }

              const { done, value: chunk } = result;
              if (done) break;

              lastChunkTime = performance.now();
              assistantResponseText += chunk;

              if (!firstChunkReceived) {
                firstChunkReceived = true;
                ttftMs = performance.now() - requestStartTime;
                metrics.record(`${provider}_ttft`, ttftMs);
                log("INFO", "[PERFORMANCE] TTFT", {
                  requestId,
                  ttftMs: Math.round(ttftMs),
                  provider,
                  traceId: trace.traceId
                });
              }

              sendSSE(controller, 'text', chunk);

              if (performance.now() - streamStartTime > CONFIG.STREAM_TOTAL_TIMEOUT_MS) {
                log("ERROR", "[STREAM] Total timeout exceeded", { requestId, provider, traceId: trace.traceId });
                upstreamReader.cancel().catch(() => {});
                throw new TimeoutError("Stream exceeded maximum duration", "STREAM_TOTAL_TIMEOUT");
              }
            }

            try {
              const usage = await usagePromise;
              if (usage.inputTokens > 0 || usage.outputTokens > 0) {
                finalUsage = usage;
                finalUsage.totalCost = calculateCost(usage, profile);

                log("INFO", "[USAGE] Metrics", {
                  requestId,
                  provider,
                  ...finalUsage,
                  traceId: trace.traceId
                });

                metrics.record(`${provider}_input_tokens`, usage.inputTokens);
                metrics.record(`${provider}_output_tokens`, usage.outputTokens);
                metrics.record(`${provider}_total_cost`, finalUsage.totalCost);
              }
            } catch (e) {
              log("WARN", "[USAGE] Failed to collect metrics", { requestId, provider, error: e });
            }

            sendSSE(controller, 'done', {
              status: 'success',
              usage: finalUsage
            });

          } catch (error) {
            if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
              log("ERROR", "[STREAM] Critical error", {
                requestId,
                provider,
                error,
                traceId: trace.traceId
              });

              const errorType = error instanceof TimeoutError ? 'timeout' :
                               error instanceof ProviderError ? 'provider_error' :
                               error instanceof CircuitBreakerError ? 'circuit_breaker' :
                               'internal_error';

              const code = error instanceof AppError ? error.code : 'UNKNOWN_STREAM_ERROR';

              sendSSE(controller, 'error', {
                errorType,
                code,
                content: (error as Error).message
              });
            }
          } finally {
            try {
              controller.close();
            } catch (e) {}

            if (assistantResponseText.trim() && conversationId) {
              const durationMs = performance.now() - requestStartTime;
              persistMessage(requestId, {
                conversation_id: conversationId,
                role: 'assistant',
                user_id: user.id,
                content: assistantResponseText,
                model: model,
                task_type: taskType,
                metadata: {
                  duration_ms: Math.round(durationMs),
                  ttft_ms: Math.round(ttftMs),
                  provider,
                  router_reasoning: reasoning,
                  usage: finalUsage,
                  request_id: requestId,
                  trace_id: trace.traceId,
                  circuit_breaker_state: circuitBreakers[provider].getState()
                }
              });
            }

            metrics.record('request_duration', performance.now() - requestStartTime);
            log("INFO", "[REQUEST] Completed", {
              requestId,
              durationMs: Math.round(performance.now() - requestStartTime),
              traceId: trace.traceId
            });
          }
        }
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Request-ID': requestId,
          'X-Trace-ID': trace.traceId,
          'X-RateLimit-Remaining': rateLimiter.getRemainingRequests(user.id).toString()
        }
      });
    });

  } catch (error) {
    if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
      log("ERROR", "[REQUEST] Failed", {
        requestId,
        error,
        traceId: trace.traceId
      });
    }

    let status = 500;
    let message = "Internal Server Error";
    let details = undefined;
    let code = "UNKNOWN_SYNC_ERROR";

    if (error instanceof AppError) {
      status = error.status;
      message = error.message;
      code = error.code;
      if (error instanceof ValidationError) {
        details = error.details;
      }
    }

    return new Response(
      JSON.stringify({ error: message, details, requestId, code, traceId: trace.traceId }),
      {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Trace-ID': trace.traceId
        }
      }
    );
  }
});
