import { useEffect, useCallback, useRef, useReducer } from 'react';
// Assuming ChatMessage definition includes the optional 'status' field: 'sending' | 'streaming' | 'complete' | 'error';
import { ChatMessage, StoredFile, AiModelKey, SessionId, ConversationId } from '../types';
import { generateTempId } from '../lib/utils';
import { MODEL_CONFIGS } from '../config/models';
import { supabase } from '../lib/supabaseClient';
import { updateConversationTitle } from '../utils/conversationNaming';

// ============================================================================
// Configuration & Environment
// ============================================================================

// Use Vite environment variables for the endpoint
const API_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-router`;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 500; // ms

// ============================================================================
// Types & Interfaces
// ============================================================================

interface UseAiRouterChatArgs {
  sessionId: SessionId | null; // UI session tracking
  accessToken: string | null;
  userId: string | null;
  files: StoredFile[];
  onActionRequest?: (action: string, args: unknown, messageId: string, appendMessage: (message: ChatMessage) => void) => Promise<void>;
  selectedModel: AiModelKey;
  spaceId: string | null;
}

interface ChatState {
    messages: ChatMessage[];
    isSending: boolean;
    isLoadingHistory: boolean;
    currentProgress: number;
    currentStep: string;
    error: Error | null;
    retryCount: number;
    isRetrying: boolean;
    conversationId: ConversationId | null; // Actual database conversation.id (different from sessionId)
}

// Reducer Actions
type Action =
  | { type: 'HISTORY_LOADING' }
  | { type: 'HISTORY_LOADED'; payload: ChatMessage[] }
  | { type: 'SET_CONVERSATION_ID'; payload: string }
  | { type: 'SEND_START'; payload: { userMessage: ChatMessage, assistantPlaceholder: ChatMessage } }
  | { type: 'STREAM_CHUNK'; payload: { content: string; messageId: string } }
  | { type: 'PROGRESS_UPDATE'; payload: { progress: number; step: string } }
  | { type: 'MODEL_SWITCH'; payload: { messageId: string, provider: string; model: string; metadata: any } }
  | { type: 'STREAM_END'; payload: { messageId: string } }
  | { type: 'ERROR'; payload: { error: Error, messageId?: string } }
  | { type: 'RETRY_START'; payload: { attempt: number } }
  | { type: 'APPEND_MESSAGE'; payload: ChatMessage }
  | { type: 'CLEAR_MESSAGES' };

// Structure of the data expected from the SSE stream
interface SSEMessage {
    type: 'text' | 'progress' | 'model_switch' | 'router_decision' | 'done' | 'error' | 'action_request';
    content?: string;
    progress?: number;
    step?: string;
    provider?: string;
    model?: string;
    metadata?: any;
    action?: string;
    args?: unknown;
    agent?: string;
    intent?: string;
    confidence?: number;
    handoffSummary?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

const debugLog = (message: string, data: any = {}) => {
    // Ensure debugging logs only appear in development
    if (import.meta.env.DEV) {
      console.log(`[🚀 CHAT DEBUG] ${message}`, data);
    }
};

/**
 * A robust fetch wrapper that retries requests with exponential backoff and jitter.
 */
const fetchWithRetry = async (url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);

      // Success or non-retriable errors (4xx except 429)
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }

      // If we hit the last retry, return the failed response anyway
      if (i === retries - 1) {
        return response;
      }

      debugLog(`Retrying request (Attempt ${i + 1}) due to status ${response.status}.`);

    } catch (error) {
      // Catches network errors (e.g., DNS failure, connection refused)

      // Do not retry if aborted by the user/component
      if (error instanceof Error && error.name === 'AbortError') {
          throw error;
      }

      debugLog(`Retrying request (Attempt ${i + 1}) due to network error:`, error);
      if (i === retries - 1) throw error;
    }

    // Exponential backoff with jitter (to prevent synchronized retries/thundering herd)
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, i) * (1 + Math.random() * 0.3);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  // Should be caught by the final iteration logic, but as a fallback:
  throw new Error(`Request failed after ${retries} attempts.`);
};

// ============================================================================
// Reducer (Efficient State Management)
// ============================================================================

const initialState: ChatState = {
    messages: [],
    isSending: false,
    isLoadingHistory: true, // Assume loading until history is fetched or confirmed absent
    currentProgress: 0,
    currentStep: '',
    error: null,
    retryCount: 0,
    isRetrying: false,
    conversationId: null,
};

const chatReducer = (state: ChatState, action: Action): ChatState => {
    switch (action.type) {
      case 'HISTORY_LOADING':
        return { ...state, isLoadingHistory: true, error: null };
      case 'HISTORY_LOADED':
        // Ensure all loaded messages have a status
        const loadedMessages = action.payload.map(msg => ({
          ...msg,
          status: msg.status || 'complete',
        }));
        return { ...state, messages: loadedMessages, isLoadingHistory: false };
      case 'SET_CONVERSATION_ID':
        return { ...state, conversationId: action.payload };
      case 'SEND_START':
        // Optimistic UI update
        return {
            ...state,
            messages: [...state.messages, action.payload.userMessage, action.payload.assistantPlaceholder],
            isSending: true,
            error: null,
            currentProgress: 5,
            currentStep: 'Initializing...'
        };
      case 'STREAM_CHUNK':
        // Efficiently update only the specific message content
        const updatedMessagesChunk = state.messages.map(msg =>
            msg.id === action.payload.messageId
            // Ensure status is 'streaming' while chunks arrive
            ? { ...msg, content: msg.content + action.payload.content, status: 'streaming' }
            : msg
        );
        return { ...state, messages: updatedMessagesChunk };
      case 'PROGRESS_UPDATE':
        return { ...state, currentProgress: action.payload.progress, currentStep: action.payload.step };
      case 'MODEL_SWITCH':
        // Update metadata on the active streaming message
        const updatedMessagesSwitch = state.messages.map(msg =>
            msg.id === action.payload.messageId
            ? { ...msg, metadata: { ...(msg.metadata || {}), provider: action.payload.provider, model: action.payload.model, router_info: action.payload.metadata } }
            : msg
        );
        return { ...state, messages: updatedMessagesSwitch };
      case 'STREAM_END':
        // Mark the stream as finished and update status to complete
        const updatedMessagesEnd = state.messages.map(msg =>
            msg.id === action.payload.messageId
            ? { ...msg, status: 'complete', metadata: { ...(msg.metadata || {}), isStreaming: false } }
            : msg
        );
        return { ...state, messages: updatedMessagesEnd, isSending: false, currentProgress: 100, currentStep: 'Complete' };
      case 'ERROR':
        let errorState = { ...state, error: action.payload.error, isSending: false, isLoadingHistory: false, isRetrying: false };
        if (action.payload.messageId) {
            // If an error occurred during streaming, update the placeholder message to reflect the error
            const updatedMessagesError = state.messages.map(msg =>
                msg.id === action.payload.messageId
                // Update status to 'error'. We do not change the role to 'system' to maintain UI consistency for the assistant bubble.
                ? {
                    ...msg,
                    // If partial content exists, append the error; otherwise, just show the error.
                    content: msg.content ? `${msg.content}\n\n[Error: ${action.payload.error.message}]` : `Error: ${action.payload.error.message}`,
                    status: 'error',
                    metadata: { ...(msg.metadata || {}), isError: true, isStreaming: false }
                  }
                : msg
            );
            errorState.messages = updatedMessagesError;
        }
        return errorState;
      case 'RETRY_START':
        return { ...state, retryCount: action.payload.attempt, isRetrying: true, error: null, currentStep: `Retrying (attempt ${action.payload.attempt})...` };
      case 'APPEND_MESSAGE':
          // Used for system messages or action results injected externally
          // Ensure appended messages have a status
          const messageWithStatus = { ...action.payload, status: action.payload.status || 'complete' };
          return { ...state, messages: [...state.messages, messageWithStatus] };
      case 'CLEAR_MESSAGES':
        return { ...initialState, isLoadingHistory: false, retryCount: 0, isRetrying: false };
      default:
        return state;
    }
  };

// ============================================================================
// Main Hook
// ============================================================================

export const useAiRouterChat = ({
  sessionId,
  accessToken,
  userId,
  // files // Kept in interface but unused in this hook implementation
  onActionRequest,
  selectedModel,
  spaceId,
}: UseAiRouterChatArgs) => {

  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper to append messages (used by ChatInterface when handling actions)
  const appendMessage = useCallback((message: ChatMessage) => {
    // Status management is handled within the reducer for APPEND_MESSAGE
    dispatch({ type: 'APPEND_MESSAGE', payload: message });
  }, []);

  // 1. Load History from Supabase
  useEffect(() => {
    if (!sessionId || !accessToken) {
      dispatch({ type: 'HISTORY_LOADED', payload: [] });
      return;
    }

    let cancelled = false;

    const fetchHistory = async () => {
      dispatch({ type: 'HISTORY_LOADING' });
      try {
        if (!supabase) throw new Error('Supabase client not initialized');

        // Get conversation ID from session
        const { data: conversation, error: convError } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('session_id', sessionId)
          .maybeSingle();

        if (convError) {
          console.error('[History] Conversation lookup error:', convError);
          throw convError;
        }
        if (!conversation) {
          debugLog('📭 No conversation found for session', { sessionId });
          if (!cancelled) dispatch({ type: 'HISTORY_LOADED', payload: [] });
          return;
        }

        debugLog('📂 Found conversation', { conversationId: conversation.id, sessionId });

        // Store the actual conversation ID for use in sending messages
        if (!cancelled) {
          dispatch({ type: 'SET_CONVERSATION_ID', payload: conversation.id });
        }

        // Load the most recent messages (last 50)
        const { data: history, error: historyError } = await supabase
          .from('ai_messages')
          .select('id, role, content, created_at, metadata')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (historyError) throw historyError;

        if (!cancelled) {
          // Reverse to show oldest first
          const reversedHistory = (history || []).reverse();
          const messages: ChatMessage[] = reversedHistory.map((msg) => ({
            id: String(msg.id),
            role: msg.role as ChatMessage['role'],
            content: msg.content,
            // Status is assigned in the reducer during HISTORY_LOADED
            createdAt: msg.created_at,
            timestamp: new Date(msg.created_at).getTime(),
            metadata: (msg.metadata as Record<string, unknown>) || {},
          }));

          dispatch({ type: 'HISTORY_LOADED', payload: messages });
          debugLog("✅ History Loaded", { count: messages.length });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load history:", err);
          dispatch({ type: 'ERROR', payload: { error: err instanceof Error ? err : new Error('History load error') } });
        }
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [sessionId, accessToken]);


  // 2. Send Message and Handle Stream
  const sendMessageInternal = useCallback(async (
    content: string,
    fileIds: string[] = [],
    imageIds: string[] = [],
    isRetry: boolean = false
  ) => {
    // Capture the current state relevant for this send operation
    const currentMessages = state.messages;
    const currentConversationId = state.conversationId;

    if (!sessionId || !accessToken || state.isSending) return;

    // --- State Setup & Optimistic UI ---
    const userMessage: ChatMessage = {
      id: generateTempId(),
      role: 'user',
      content,
      status: 'complete', // User messages are immediately complete
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      metadata: { attached_file_ids: fileIds, attached_image_ids: imageIds },
    };

    const assistantMessageId = generateTempId();
    // Initialize the placeholder with 'streaming' status
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming', // FIX: Explicitly set status for the typing indicator
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      metadata: { isStreaming: true },
    };

    // Only add user message on first attempt, not on retries
    if (!isRetry) {
      dispatch({ type: 'SEND_START', payload: { userMessage, assistantPlaceholder } });

      // Auto-update conversation title based on first user message
      // Check against the local snapshot of messages
      if (userId && currentMessages.filter(m => m.role === 'user').length === 0) {
        updateConversationTitle(sessionId, content, supabase, userId).catch(err => {
          console.error('Failed to update conversation title:', err);
        });
      }
    } else {
      // On retry, just update the assistant message to show we're retrying
      dispatch({ type: 'PROGRESS_UPDATE', payload: { progress: 5, step: 'Retrying...' } });
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Determine the hint reliably using the imported configuration
    let providerHint = 'auto';
    if (selectedModel !== 'auto' && MODEL_CONFIGS[selectedModel]) {
        providerHint = MODEL_CONFIGS[selectedModel].providerKey;
    }

    try {
      // Build messages array from current conversation history + new user message
      // Use the local snapshot of messages
      const conversationMessages = currentMessages
        // Filter out system/error messages. Only include completed messages for context.
        .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.status === 'complete')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Add the new user message (which is already in state but needs to be in the payload)
      conversationMessages.push({
        role: 'user',
        content: content
      });

      // CRITICAL FIX: Use actual conversation.id from database, NOT sessionId
      let resolvedConvId = currentConversationId;

      if (!resolvedConvId && sessionId) {
        debugLog('⚠️ No conversationId in state, attempting to resolve from sessionId', { sessionId });
        // Try to resolve conversation ID before sending
        try {
          const { data: conv, error: convError } = await supabase
            .from('ai_conversations')
            .select('id')
            .eq('session_id', sessionId)
            .maybeSingle();

          if (convError) {
            debugLog('❌ Failed to resolve conversation ID', { error: convError });
          } else if (conv) {
            debugLog('✅ Resolved conversation ID', { conversationId: conv.id, sessionId });
            dispatch({ type: 'SET_CONVERSATION_ID', payload: conv.id });
            resolvedConvId = conv.id; // Update local variable
          }
        } catch (err) {
          debugLog('❌ Exception resolving conversation ID', err);
        }
      }

      const payload = {
        messages: conversationMessages,
        conversationId: resolvedConvId || sessionId, // Use resolved ID if available
        sessionId: sessionId, // Include sessionId separately for backend reference
        imageIds,
        preferredProvider: providerHint !== 'auto' ? providerHint : undefined,
        mode: 'chat'
      };

      debugLog('📤 Sending payload', {
        messageCount: conversationMessages.length,
        hasImages: imageIds.length > 0,
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        idsMatch: payload.conversationId === payload.sessionId,
        endpoint: API_ENDPOINT
      });

      console.log('[SEND MESSAGE] About to fetch from:', API_ENDPOINT);
      console.log('[SEND MESSAGE] Payload:', JSON.stringify(payload, null, 2));

      // --- Network Request (with Retry Logic) ---
      const response = await fetchWithRetry(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      console.log('[SEND MESSAGE] Response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Handle non-OK responses (including those returned after retries failed)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Invalid error response format' }));
        debugLog('❌ Response not OK:', { status: response.status, statusText: response.statusText, errorData });
        // This catches the specific "TypeError: Cannot read properties of undefined (reading 'provider')" if the backend returns it
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      if (!response.body) {
        console.error('[SEND MESSAGE] Response body is null!');
        throw new Error('Response body is empty, cannot stream.');
      }

      console.log('[SEND MESSAGE] Starting to read SSE stream...');

      // --- Stream Processing Loop (SSE) ---
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastDataTime = Date.now();
      let currentProgress = 0;
      const STREAM_TIMEOUT_MS = 90000; // 90 seconds without data = timeout
      const LONG_WAIT_WARNING_MS = 15000; // 15 seconds = show "still generating"

      // Helper to check for timeout
      const checkStreamTimeout = () => {
        const elapsed = Date.now() - lastDataTime;
        if (elapsed > LONG_WAIT_WARNING_MS && elapsed < STREAM_TIMEOUT_MS) {
          dispatch({ type: 'PROGRESS_UPDATE', payload: { progress: currentProgress, step: 'Still generating...' } });
        } else if (elapsed > STREAM_TIMEOUT_MS) {
          throw new Error('Stream timed out - no data received for 90 seconds');
        }
      };

      // Set up timeout checker
      const timeoutChecker = setInterval(checkStreamTimeout, 5000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[SEND MESSAGE] Stream done, closing...');
            break;
          }

          lastDataTime = Date.now(); // Reset timeout on each data chunk
          const chunk = decoder.decode(value, { stream: true });
          console.log('[SEND MESSAGE] Received chunk:', chunk.substring(0, 100));
          buffer += chunk;
          // SSE messages MUST be separated by double newlines
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || ''; // Keep the last partial event in the buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            // Parse SSE format: "event: eventname\ndata: payload"
            const lines = message.split('\n');
            let eventType = 'message'; // default SSE event type
            let dataPayload = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
              } else if (line.startsWith('data: ')) {
                dataPayload = line.substring(6);
              }
            }

            if (!dataPayload) continue;

            try {
              // Handle different event types
              switch (eventType) {
                case 'text':
                  // Text chunks are sent as plain strings, not JSON
                  dispatch({ type: 'STREAM_CHUNK', payload: { content: dataPayload, messageId: assistantMessageId } });
                  break;

                case 'metadata': {
                  // Metadata is JSON
                  const metadata = JSON.parse(dataPayload);
                  console.log('[SEND MESSAGE] Metadata received:', metadata);
                  break;
                }

                case 'done': {
                  // Done event with usage info
                  const doneData = JSON.parse(dataPayload);
                  console.log('[SEND MESSAGE] Stream complete:', doneData);
                  break;
                }

                case 'error': {
                  // Error event
                  const errorData = JSON.parse(dataPayload);
                  throw new Error(errorData.content || 'Stream error occurred');
                }

                case 'debug': {
                  // Debug events (only in debug mode)
                  const debugData = JSON.parse(dataPayload);
                  console.log('[DEBUG EVENT]', debugData.stage, debugData);
                  break;
                }

                case 'message':
                default: {
                  // Legacy format fallback: data contains JSON with type field
                  try {
                    const data: SSEMessage = JSON.parse(dataPayload);

                    switch (data.type) {
                      case 'text':
                        if (data.content) {
                          dispatch({ type: 'STREAM_CHUNK', payload: { content: data.content, messageId: assistantMessageId } });
                        }
                        break;

                      case 'progress':
                        if (data.progress !== undefined && data.step) {
                          currentProgress = data.progress;
                          dispatch({ type: 'PROGRESS_UPDATE', payload: { progress: data.progress, step: data.step } });
                        }
                        break;

                      case 'router_decision':
                        // Debug log routing decision
                        if (import.meta.env.DEV) {
                          console.group('🎭 Router Decision');
                          console.log('Agent:', data.agent);
                          console.log('Intent:', data.intent);
                          console.log('Confidence:', data.confidence);
                          console.log('Model:', `${data.provider}/${data.model}`);
                          console.groupEnd();
                        }

                        // Add theater messages to the chat
                        if (data.agent && data.intent) {
                          const confidencePercent = data.confidence ? Math.round(data.confidence * 100) : 0;
                          const theaterMessages = [
                            `[System: Analysis complete. Intent: ${data.intent}. Confidence: ${confidencePercent}%]`,
                            `[System: Routing to ${data.agent} (${data.model})...]`,
                            data.handoffSummary ? `[Handoff: ${data.handoffSummary}]` : null,
                            `[Status: Connected]`
                          ].filter(Boolean);

                          theaterMessages.forEach((content) => {
                            dispatch({
                              type: 'APPEND_MESSAGE',
                              payload: {
                                id: crypto.randomUUID(),
                                role: 'system',
                                content: content as string,
                                // Status is handled by the reducer for APPEND_MESSAGE
                                created_at: new Date().toISOString(),
                              }
                            });
                          });
                        }
                        break;

                      case 'model_switch':
                        if (data.provider && data.model) {
                          dispatch({ type: 'MODEL_SWITCH', payload: { messageId: assistantMessageId, provider: data.provider, model: data.model, metadata: data.metadata }});
                        }
                        break;

                      case 'action_request':
                        if (onActionRequest && data.action) {
                          onActionRequest(data.action, data.args, assistantMessageId, appendMessage).catch(err => {
                            debugLog("❌ Action failed", err);
                          });
                        }
                        break;

                      // ... (Other cases: status, keepalive, heartbeat, warning, error, done remain the same)

                      default:
                        break;
                    }
                  } catch (parseError) {
                    debugLog('SSE parse error (malformed legacy event):', { parseError, dataPayload: dataPayload.substring(0, 100) });
                    console.warn('[Stream] Skipping malformed legacy SSE event');
                  }
                  break;
                }
              }
            } catch (error) {
              console.error('[SEND MESSAGE] Error processing SSE event:', error);
              throw error;
            }
          }
        }

        // If loop finishes successfully
        dispatch({ type: 'STREAM_END', payload: { messageId: assistantMessageId } });
      } finally {
        // Clean up timeout checker
        clearInterval(timeoutChecker);
      }

    } catch (err) {
      debugLog('❌ CATCH BLOCK ERROR:', err);

      // Handle aborts gracefully (don't show an error state, just stop streaming)
      if (err instanceof Error && err.name === 'AbortError') {
        // Mark as complete (even if partial) rather than error
        dispatch({ type: 'STREAM_END', payload: { messageId: assistantMessageId } });
        return;
      }

      const error = err instanceof Error ? err : new Error('An unknown error occurred during send/stream.');

      // Check the latest state snapshot to see if partial content arrived before the error.
      // We check `state.messages` here to get the most recent state after potential stream updates before the error.
      const potentiallyPartialMessage = state.messages.find(m => m.id === assistantMessageId);
      const hasPartialContent = potentiallyPartialMessage && potentiallyPartialMessage.content.length > 0;

      if (hasPartialContent) {
        debugLog('💾 Preserving partial response:', { contentLength: potentiallyPartialMessage.content.length });
        // The subsequent ERROR dispatch will handle appending the error message and setting status.
      }

      // Check if error is retriable (no partial content received yet)
      const isRetriable = !hasPartialContent && (
        error.message.includes('503') ||
        error.message.includes('overload') ||
        error.message.includes('busy') ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('fetch failed')
      );

      // Implement retry logic for retriable errors
      const MAX_AUTO_RETRIES = 2;
      const currentRetryCount = state.retryCount || 0;

      if (isRetriable && currentRetryCount < MAX_AUTO_RETRIES) {
        const nextAttempt = currentRetryCount + 1;
        const retryDelay = nextAttempt === 1 ? 3000 : 7000; // 3s then 7s

        debugLog(`⏳ Auto-retry attempt ${nextAttempt}/${MAX_AUTO_RETRIES} in ${retryDelay}ms`);
        dispatch({ type: 'RETRY_START', payload: { attempt: nextAttempt } });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        // Retry the same message
        try {
          // Recursive call with same parameters, marking as retry
          await sendMessageInternal(content, fileIds, imageIds, true);
          return; // Success, exit
        } catch (retryErr) {
          // If retry also fails, fall through to error dispatch
          debugLog('❌ Retry failed:', retryErr);
        }
      }

      // Dispatch error with better messaging (this triggers the status update in the reducer)
      let userFriendlyError = error;
      // ... (Error message refinement logic remains the same)

      dispatch({ type: 'ERROR', payload: { error: userFriendlyError, messageId: assistantMessageId } });

    } finally {
      abortControllerRef.current = null;
    }
  // Dependency array updated to rely on the whole state object for snapshots and latest state access
  }, [sessionId, accessToken, userId, onActionRequest, selectedModel, spaceId, appendMessage, state]);

  // Wrapper for external calls (without retry flag)
  const sendMessage = useCallback(async (
    content: string,
    fileIds: string[] = [],
    imageIds: string[] = []
  ) => {
    return sendMessageInternal(content, fileIds, imageIds, false);
  }, [sendMessageInternal]);

  const clearMessages = useCallback(() => {
    if (state.isSending) return;
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, [state.isSending]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      debugLog("🛑 Stop requested.");
    }
  }, []);

  return {
    ...state,
    sendMessage,
    clearMessages,
    stop,
    cancelStream: stop, // Alias for backward compatibility
    appendMessage,
  };
};