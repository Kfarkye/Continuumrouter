import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChatMessage, StoredFile, FileAttachment, Memory } from '../types';
import { supabase } from '../lib/supabaseClient';
import { captureMemory, retrieveMemories } from '../services/memoryService';

// -----------------------------------------------------------------------------
// Configuration and Constants
// -----------------------------------------------------------------------------

const AI_ROUTER_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-router`;
const NOOP = () => {};

const DEFAULT_CONFIG = {
  IDLE_TIMEOUT_MS: 120_000,
  RETRY_COUNT: 2,
  RETRY_BASE_DELAY_MS: 750,
  // Load the last 50 messages. Provides ample recent context without pagination complexity.
  RECENT_MESSAGE_LIMIT: 50,
};

// -----------------------------------------------------------------------------
// Types and Interfaces
// -----------------------------------------------------------------------------

export interface ChatError {
  code: string;
  message: string;
  details?: unknown;
}

// ENHANCEMENT: Aligned provider names with backend expectations
export type AiProvider = 'anthropic' | 'gemini' | 'openai';

export interface UseAiRouterChatArgs {
  sessionId: string | null;
  accessToken: string | null;
  userId: string | null;
  files: StoredFile[];
  onActionRequest: (action: string, args: any) => Promise<void>;
  // ENHANCEMENT: Updated type definition to match backend provider keys
  selectedModel?: 'auto' | AiProvider;
  config?: Partial<typeof DEFAULT_CONFIG>;
  spaceId?: string | null;
}

type AbortReason = 'user' | 'timeout' | 'internal';

// Discriminated Union for Stream Chunks
interface ProgressChunk { type: 'progress'; progress: number; step: string; }
interface ModelSwitchChunk { type: 'model_switch'; model: string; content?: string; metadata?: Record<string, unknown>; }
interface TextChunk { type: 'text'; content: string; }
interface ActionRequestChunk { type: 'action_request'; action: string; content: unknown; }
interface MetadataChunk { type: 'metadata'; content: Record<string, unknown>; }
interface ErrorChunk { type: 'error'; content: unknown; }
interface InfoChunk { type: 'warning' | 'success'; content: unknown; }
interface DoneChunk { type: 'done'; }

type RouterChunk =
  | ProgressChunk | ModelSwitchChunk | TextChunk | ActionRequestChunk
  | MetadataChunk | ErrorChunk | InfoChunk | DoneChunk;

// -----------------------------------------------------------------------------
// Utility Functions and Hooks
// -----------------------------------------------------------------------------

function useLatestRef<T>(value: T) {
    const ref = useRef(value);
    useEffect(() => { ref.current = value; }, [value]);
    return ref;
}

class TextAccumulator {
    private parts: string[] = [];
    private cache = '';
    private consumed = 0;
    append(s: string) { if (!s) return; this.parts.push(s); }
    value(): string {
        if (this.consumed < this.parts.length) {
            const newSeg = this.parts.slice(this.consumed).join('');
            this.cache += newSeg;
            this.consumed = this.parts.length;
        }
        return this.cache;
    }
    clear() { this.parts = []; this.cache = ''; this.consumed = 0; }
}

function calculateRetryAfter(headerValue: string): number {
    const seconds = parseInt(headerValue, 10);
    if (!isNaN(seconds)) return Math.max(0, seconds * 1000);
    const date = new Date(headerValue);
    if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
    return 0;
}

async function fetchWithRetry(url: string, options: RequestInit, retries: number, delay: number): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const status = response.status;
                if ((status >= 500 || status === 429) && i < retries) {
                    const retryAfterHeader = response.headers.get('Retry-After');
                    let backoffMs = status === 429 && retryAfterHeader ? calculateRetryAfter(retryAfterHeader) : delay * Math.pow(2, i);
                    const jitter = (Math.random() * 0.4 - 0.2) * backoffMs;
                    const waitTime = Math.max(100, backoffMs + jitter);
                    console.warn(`Retrying request (Attempt ${i+1}) due to status ${status}. Waiting ${waitTime.toFixed(0)}ms.`);
                    await new Promise((r) => setTimeout(r, waitTime));
                    continue;
                }
            }
            return response;
        } catch (e) {
            lastErr = e;
            if (e instanceof DOMException && e.name === 'AbortError') throw e;
            if (i < retries) {
                const backoffMs = delay * Math.pow(2, i);
                const jitter = (Math.random() * 0.4 - 0.2) * backoffMs;
                const waitTime = Math.max(100, backoffMs + jitter);
                console.warn(`Retrying request (Attempt ${i+1}) due to network error. Waiting ${waitTime.toFixed(0)}ms. Error: ${(e as Error)?.message}`);
                await new Promise((r) => setTimeout(r, waitTime));
                continue;
            }
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`All retry attempts failed. Last error: ${String(lastErr)}`);
}

function parseLineToChunk(line: string): RouterChunk | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) return null;
    const dataPrefix = 'data:';
    const jsonString = trimmed.startsWith(dataPrefix) ? trimmed.slice(dataPrefix.length).trim() : trimmed;
    if (jsonString === '[DONE]' || jsonString === 'DONE') return { type: 'done' };
    try {
        const obj = JSON.parse(jsonString);
        if (typeof obj !== 'object' || obj === null || typeof obj.type !== 'string') return null;
        switch (obj.type) {
            case 'progress': return { type: 'progress', progress: Number(obj.progress) || 0, step: String(obj.step || '') };
            case 'text': return { type: 'text', content: String(obj.content ?? '') };
            case 'model_switch':
                if (typeof obj.model !== 'string') return null;
                return { type: 'model_switch', model: obj.model, content: typeof obj.content === 'string' ? obj.content : undefined, metadata: (typeof obj.metadata === 'object' && obj.metadata) ? obj.metadata : undefined };
            case 'action_request':
                if (typeof obj.action !== 'string') return null;
                return { type: 'action_request', action: obj.action, content: obj.content };
            case 'metadata':
                return { type: 'metadata', content: (typeof obj.content === 'object' && obj.content !== null && !Array.isArray(obj.content)) ? obj.content : { raw: obj.content } };
            case 'error':
            case 'warning':
            case 'success':
                return { type: obj.type, content: obj.content };
            case 'done': return { type: 'done' };
            default: return null;
        }
    } catch { return null; }
}


// -----------------------------------------------------------------------------
// Main Hook
// -----------------------------------------------------------------------------

export const useAiRouterChat = ({
  sessionId,
  accessToken,
  userId,
  files,
  onActionRequest,
  selectedModel = 'auto',
  config: customConfig,
  spaceId,
}: UseAiRouterChatArgs) => {
  const CONFIG = useMemo(() => ({ ...DEFAULT_CONFIG, ...customConfig }), [customConfig]);

  // Core state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<ChatError | null>(null);

  // Stable refs and control flow
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<AbortReason | null>(null);
  const mountedRef = useRef(true);
  const onActionRequestRef = useLatestRef(onActionRequest);
  const isSendingRef = useLatestRef(isSending);

  // RAF-Throttled Streaming Accumulators
  const assistantTextAccRef = useRef(new TextAccumulator());
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantMetadataRef = useRef<Record<string, unknown>>({});
  const assistantStatusRef = useRef<'streaming' | 'complete' | 'error'>('streaming');
  const assistantProgressRef = useRef<number>(0);
  const assistantStepRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);

  // O(1) file lookup map
  const filesById = useMemo(() => {
    const map = new Map<string, StoredFile>();
    // Ensure files is iterable even if null/undefined was passed
    const fileList = Array.isArray(files) ? files : [];
    for (const f of fileList) {
        if (f && f.id) {
           map.set(f.id, f);
        }
    }
    return map;
  }, [files]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isSendingRef.current) {
        abortReasonRef.current = 'internal';
      }
      abortControllerRef.current?.abort();
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isSendingRef]);

  // Load history when sessionId changes
  useEffect(() => {
    let cancelled = false;

    if (isSendingRef.current) {
        abortReasonRef.current = 'internal';
        abortControllerRef.current?.abort();
    }

    async function loadHistory(sid: string) {
      setIsLoadingHistory(true);
      setError(null);
      try {
        const { data: conversation, error: convError } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('session_id', sid)
          .maybeSingle();

        if (convError) throw convError;
        if (!conversation) {
          if (!cancelled) {
            setMessages([]);
          }
          return;
        }

        // Load the most recent messages up to the limit
        const { data: history, error: historyError } = await supabase
          .from('ai_messages')
          .select('id, role, content, created_at, metadata')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false }) // Get newest first
          .limit(CONFIG.RECENT_MESSAGE_LIMIT);

        if (historyError) throw historyError;

        if (!cancelled) {
          // Reverse the results to display chronologically (oldest first)
          const reversedHistory = (history || []).reverse();
          const next: ChatMessage[] = reversedHistory.map((msg) => ({
            id: String(msg.id),
            role: msg.role as ChatMessage['role'],
            content: msg.content,
            timestamp: new Date(msg.created_at).getTime(),
            status: 'complete',
            metadata: (msg.metadata as Record<string, unknown>) || {},
          }));

          setMessages(next);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("Failed to load history:", e);
          setError({ code: 'LOAD_HISTORY_FAILED', message: 'Failed to load history.', details: e?.message });
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    if (sessionId) {
      loadHistory(sessionId);
    } else {
      setMessages([]);
      setIsLoadingHistory(false);
    }
    return () => { cancelled = true; };
  }, [sessionId, isSendingRef, CONFIG.RECENT_MESSAGE_LIMIT]);

  const scheduleAssistantCommit = useCallback(() => {
    if (rafIdRef.current != null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!mountedRef.current) return;

      const assistantId = assistantMessageIdRef.current;
      if (!assistantId) return;

      const content = assistantTextAccRef.current.value();
      const progress = assistantProgressRef.current;
      const step = assistantStepRef.current;
      const status = assistantStatusRef.current;
      const meta = assistantMetadataRef.current;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx === -1) return prev;
        const next = prev.slice();
        const currentMsg = next[idx];
        next[idx] = {
          ...currentMsg,
          content,
          status,
          progress,
          metadata: { ...meta },
          search_results: meta.search_results || currentMsg.search_results,
        };
        return next;
      });
      setCurrentProgress(progress);
      setCurrentStep(step);
    });
  }, []);

  const cancelStream = useCallback((reason: AbortReason = 'user') => {
    if (abortControllerRef.current && isSendingRef.current) {
      abortReasonRef.current = reason;
      abortControllerRef.current.abort();
      setCurrentStep(reason === 'user' ? 'Cancelling...' : 'Stopping...');
    }
  }, [isSendingRef]);

  const sendMessage = useCallback(
    async (content: string, attachedFileIds: string[], imageIds: string[] = []) => {
      // 1. Guards and Initialization
      if (!sessionId) {
        setError({ code: 'NO_SESSION', message: 'Session ID is required.' });
        return;
      }
      if (isSendingRef.current) {
        console.warn("Message already in flight. Ignoring request.");
        return;
      }

      if (!accessToken || !userId) {
        setError({ code: 'AUTH_REQUIRED', message: 'Authentication required.' });
        return;
      }

      setError(null);
      setIsSending(true);
      setCurrentProgress(0);
      setCurrentStep('Initializing...');

      // Reset accumulators
      assistantTextAccRef.current.clear();
      assistantMetadataRef.current = {};
      assistantStatusRef.current = 'streaming';
      assistantProgressRef.current = 0;
      assistantStepRef.current = 'Initializing...';
      abortReasonRef.current = null;

      // 2. Prepare Data and Optimistic UI Update
      const attachedFiles: StoredFile[] = attachedFileIds.map(id => filesById.get(id)).filter((f): f is StoredFile => !!f);
      const fileAttachments: FileAttachment[] | undefined =
        attachedFiles.length > 0
          ? attachedFiles.map(({ name, content }) => ({ name, content, type: 'file' }))
          : undefined;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
        status: 'complete',
        files: attachedFiles.map(({ name, size }) => ({ name, size })),
        metadata: {
          attachedFileIds,
          attachedImageIds: imageIds.length > 0 ? imageIds : undefined
        },
      };

      const assistantMessageId = crypto.randomUUID();
      assistantMessageIdRef.current = assistantMessageId;

      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
        progress: 0,
        metadata: {},
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

      // 3. Network Request and Stream Processing
      try {
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const providerHint = selectedModel === 'auto' ? undefined : selectedModel;

        let relevantMemories: Memory[] = [];

        // FIX: Check only for accessToken. We attempt to retrieve memories even if spaceId is null
        // (Assuming retrievalService handles spaceId || undefined correctly for global search)
        if (accessToken) {
          try {
            relevantMemories = await retrieveMemories(content, accessToken, spaceId || undefined);
            if (relevantMemories.length > 0) {
              console.log(`📚 Retrieved ${relevantMemories.length} relevant memories for context`);
            }
          } catch (err) {
            console.warn('Memory retrieval failed, continuing without memories:', err);
          }
        }

        // DEBUG: Log what we're about to send
        console.log('[🚀 CHAT DEBUG] === ABOUT TO SEND REQUEST ===');
        console.log('[🚀 CHAT DEBUG] sessionId:', sessionId);
        console.log('[🚀 CHAT DEBUG] userId:', userId);
        console.log('[🚀 CHAT DEBUG] spaceId:', spaceId);
        console.log('[🚀 CHAT DEBUG] spaceId type:', typeof spaceId);
        console.log('[🚀 CHAT DEBUG] imageIds:', imageIds);
        console.log('[🚀 CHAT DEBUG] imageIds count:', imageIds.length);
        console.log('[🚀 CHAT DEBUG] imageIds will be sent as:', imageIds.length > 0 ? imageIds : undefined);
        console.log('[🚀 CHAT DEBUG] memories count:', relevantMemories.length);
        console.log('[🚀 CHAT DEBUG] providerHint:', providerHint);
        console.log('[🚀 CHAT DEBUG] accessToken present:', !!accessToken);
        console.log('[🚀 CHAT DEBUG] AI_ROUTER_FUNCTION_URL:', AI_ROUTER_FUNCTION_URL);

        const response = await fetchWithRetry(
          AI_ROUTER_FUNCTION_URL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              'X-Request-Id': crypto.randomUUID(),
              'Cache-Control': 'no-store',
            },
            body: JSON.stringify({
              sessionId,
              userMessage: content,
              attachedFiles: fileAttachments,
              imageIds: imageIds.length > 0 ? imageIds : undefined,
              providerHint,
              spaceId: spaceId || null,
              memories: relevantMemories.length > 0 ? relevantMemories : undefined
            }),
            keepalive: true,
            signal: abortControllerRef.current.signal,
          },
          CONFIG.RETRY_COUNT,
          CONFIG.RETRY_BASE_DELAY_MS
        );

        if (!response.ok) {
          const errorData = await response.json().catch(NOOP);
          console.error('[🚀 CHAT DEBUG] ❌ Response not OK:', {
            status: response.status,
            statusText: response.statusText,
            errorData,
            headers: Object.fromEntries(response.headers.entries())
          });
          throw new Error(errorData?.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('[🚀 CHAT DEBUG] ✅ Response OK, starting stream processing...');

        if (!response.body) throw new Error('No response body received.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let idleTimer: number | null = null;

        // Idle Timeout Mechanism
        const resetIdle = () => {
          if (idleTimer != null) clearTimeout(idleTimer);
          idleTimer = window.setTimeout(() => {
            console.warn(`Stream timed out after ${CONFIG.IDLE_TIMEOUT_MS}ms of inactivity.`);
            cancelStream('timeout');
          }, CONFIG.IDLE_TIMEOUT_MS);
        };

        resetIdle();

        // Stream Loop
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetIdle();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const chunk = parseLineToChunk(line);
            if (!chunk) continue;

            // Log chunk types for debugging (except text chunks to avoid spam)
            if (chunk.type !== 'text') {
              console.log('[🚀 CHAT DEBUG] Received chunk:', chunk.type, chunk);
            }

            // Process chunk
            switch (chunk.type) {
                case 'progress':
                    assistantProgressRef.current = chunk.progress;
                    assistantStepRef.current = chunk.step;
                    break;
                case 'text':
                    assistantTextAccRef.current.append(chunk.content);
                    break;
                case 'model_switch':
                    assistantMetadataRef.current = {
                        ...assistantMetadataRef.current,
                        provider: chunk.model,
                        taskInfo: chunk.content,
                        ...(chunk.metadata || {}),
                    };
                    break;
                case 'metadata':
                    assistantMetadataRef.current = { ...assistantMetadataRef.current, ...chunk.content };
                    break;
                case 'warning':
                case 'success':
                    assistantMetadataRef.current = { ...assistantMetadataRef.current, [chunk.type]: chunk.content };
                    break;
                case 'action_request':
                    onActionRequestRef.current(chunk.action, chunk.content).catch((e) => {
                        console.error(`Action request failed: ${chunk.action}`, e);
                        assistantMetadataRef.current = {
                            ...assistantMetadataRef.current,
                            action_error: (e as Error)?.message ?? String(e),
                        };
                        scheduleAssistantCommit();
                    });
                    continue;
                case 'error':
                    const errorMsg = String(chunk.content ?? 'Unknown stream error');
                    const isTransientError =
                        errorMsg.includes('overloaded') ||
                        errorMsg.includes('503') ||
                        errorMsg.includes('Service Unavailable') ||
                        errorMsg.includes('UNAVAILABLE') ||
                        errorMsg.includes('429') ||
                        errorMsg.includes('rate limit');

                    if (!isTransientError) {
                        const suffix = (assistantTextAccRef.current.value().trim().length > 0 ? '\n\n' : '') + `❌ Error: ${errorMsg}`;
                        assistantTextAccRef.current.append(suffix);
                    }

                    assistantStatusRef.current = 'error';

                    if (isTransientError) {
                        console.warn('Transient AI error (hidden from user):', errorMsg);
                    } else {
                        setError({ code: 'STREAM_ERROR', message: 'AI response stream encountered an error.', details: errorMsg });
                    }
                    break;
                case 'done':
                    assistantStatusRef.current = 'complete';
                    break;
            }
            scheduleAssistantCommit();
          }
        }

        // 4. Finalization (Success Path)
        if (idleTimer != null) clearTimeout(idleTimer);
        try { reader.releaseLock(); } catch { }

        assistantStatusRef.current = assistantStatusRef.current === 'streaming' ? 'complete' : assistantStatusRef.current;
        assistantProgressRef.current = 100;
        assistantStepRef.current = assistantStatusRef.current === 'error' ? 'Error' : 'Complete';

        // Force immediate synchronous update
        const assistantId = assistantMessageIdRef.current;
        if (assistantId) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = {
              ...next[idx],
              status: assistantStatusRef.current,
              progress: 100,
              metadata: { ...assistantMetadataRef.current },
            };
            return next;
          });
        }

        setIsSending(false);

        if (accessToken && sessionId && assistantStatusRef.current === 'complete') {
          const finalAssistantContent = assistantTextAccRef.current.value();
          if (finalAssistantContent.trim()) {
            captureMemory(
              sessionId,
              content,
              finalAssistantContent,
              accessToken,
              spaceId || undefined
            ).catch(err => {
              console.warn('Memory capture failed (non-blocking):', err);
            });
          }
        }

      } catch (e: any) {
        // 4. Finalization (Error/Abort Path)
        setIsSending(false);

        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        const abortReason = abortReasonRef.current;

        let errorMessage: string;
        let errorCode: string;
        let displayStatus: string;

        if (isAbort) {
            if (abortReason === 'timeout') {
                errorMessage = 'The request timed out due to inactivity.';
                errorCode = 'STREAM_TIMEOUT';
                displayStatus = 'Timed Out';
            } else if (abortReason === 'user') {
                errorMessage = 'Cancelled by user.';
                errorCode = 'STREAM_CANCELLED_BY_USER';
                displayStatus = 'Cancelled';
            } else {
                errorMessage = 'Message generation stopped.';
                errorCode = 'STREAM_CANCELLED_INTERNAL';
                displayStatus = 'Stopped';
            }
        } else {
            console.error('[🚀 CHAT DEBUG] ❌ CATCH BLOCK ERROR:', {
              error: e,
              message: e?.message,
              stack: e?.stack,
              name: e?.name,
              type: typeof e,
              stringified: String(e)
            });
            errorMessage = e?.message || 'An unknown network or stream error occurred.';
            errorCode = 'STREAM_FETCH_FAILED';
            displayStatus = 'Error';
        }

        const suffix = isAbort ? `\n\n(${displayStatus})` : `\n\n❌ Error: ${errorMessage}`;
        assistantTextAccRef.current.append(suffix);
        assistantStatusRef.current = isAbort ? 'complete' : 'error';
        assistantProgressRef.current = isAbort ? 100 : assistantProgressRef.current;
        assistantStepRef.current = displayStatus;
        scheduleAssistantCommit();

        if (!(isAbort && abortReason === 'internal')) {
            setError({ code: errorCode, message: errorMessage, details: e?.toString() });
        }
      }
    },
    [sessionId, accessToken, userId, filesById, selectedModel, CONFIG, isSendingRef, scheduleAssistantCommit, cancelStream, onActionRequestRef, spaceId]
  );

  const regenerateMessage = useCallback(() => {
    if (isSendingRef.current || messages.length === 0) return;

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    const lastUserIndex = messages.lastIndexOf(lastUserMessage);
    if (lastUserIndex === -1) return;

    setMessages(messages.slice(0, lastUserIndex + 1));

    const content = lastUserMessage.content;
    const attachedFileIds = (lastUserMessage.metadata?.attachedFileIds as string[]) || [];
    const imageIds = (lastUserMessage.metadata?.attachedImageIds as string[]) || [];

    sendMessage(content, attachedFileIds, imageIds);
  }, [messages, sendMessage, isSendingRef]);

  const clearMessages = useCallback(() => {
    cancelStream('internal');
    setMessages([]);
    setError(null);
    setCurrentProgress(0);
    setCurrentStep('');
    assistantTextAccRef.current.clear();
    assistantMessageIdRef.current = null;
  }, [cancelStream]);

  return {
    messages,
    sendMessage,
    regenerateMessage,
    isSending,
    isLoadingHistory,
    currentProgress,
    currentStep,
    error,
    cancelStream: useCallback(() => cancelStream('user'), [cancelStream]),
    clearMessages,
  };
};