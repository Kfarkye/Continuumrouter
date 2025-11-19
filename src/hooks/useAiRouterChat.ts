import { useEffect, useCallback, useRef, useReducer } from 'react';
import { ChatMessage, StoredFile, AiModelKey } from '../types';
import { generateTempId } from '../lib/utils';
import { MODEL_CONFIGS } from '../config/models';
import { supabase } from '../lib/supabaseClient';

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
  sessionId: string | null;
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
}

// Reducer Actions
type Action =
  | { type: 'HISTORY_LOADING' }
  | { type: 'HISTORY_LOADED'; payload: ChatMessage[] }
  | { type: 'SEND_START'; payload: { userMessage: ChatMessage, assistantPlaceholder: ChatMessage } }
  | { type: 'STREAM_CHUNK'; payload: { content: string; messageId: string } }
  | { type: 'PROGRESS_UPDATE'; payload: { progress: number; step: string } }
  | { type: 'MODEL_SWITCH'; payload: { messageId: string, provider: string; model: string; metadata: any } }
  | { type: 'STREAM_END'; payload: { messageId: string } }
  | { type: 'ERROR'; payload: { error: Error, messageId?: string } }
  | { type: 'APPEND_MESSAGE'; payload: ChatMessage }
  | { type: 'CLEAR_MESSAGES' };

// Structure of the data expected from the SSE stream
interface SSEMessage {
    type: 'text' | 'progress' | 'model_switch' | 'done' | 'error' | 'action_request';
    content?: string;
    progress?: number;
    step?: string;
    provider?: string;
    model?: string;
    metadata?: any;
    action?: string;
    args?: unknown;
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
};

const chatReducer = (state: ChatState, action: Action): ChatState => {
    switch (action.type) {
      case 'HISTORY_LOADING':
        return { ...state, isLoadingHistory: true, error: null };
      case 'HISTORY_LOADED':
        return { ...state, messages: action.payload, isLoadingHistory: false };
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
            ? { ...msg, content: msg.content + action.payload.content }
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
        // Mark the stream as finished
        const updatedMessagesEnd = state.messages.map(msg =>
            msg.id === action.payload.messageId
            ? { ...msg, metadata: { ...(msg.metadata || {}), isStreaming: false } }
            : msg
        );
        return { ...state, messages: updatedMessagesEnd, isSending: false, currentProgress: 100, currentStep: 'Complete' };
      case 'ERROR':
        let errorState = { ...state, error: action.payload.error, isSending: false, isLoadingHistory: false };
        if (action.payload.messageId) {
            // If an error occurred during streaming, update the placeholder message to reflect the error
            const updatedMessagesError = state.messages.map(msg =>
                msg.id === action.payload.messageId
                ? { ...msg, content: `Error: ${action.payload.error.message}`, role: 'system', metadata: { isError: true, isStreaming: false } }
                : msg
            );
            errorState.messages = updatedMessagesError;
        }
        return errorState;
      case 'APPEND_MESSAGE':
          // Used for system messages or action results injected externally
          return { ...state, messages: [...state.messages, action.payload] };
      case 'CLEAR_MESSAGES':
        return { ...initialState, isLoadingHistory: false };
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
  // userId, files // Kept in interface but unused in this hook implementation
  onActionRequest,
  selectedModel,
  spaceId,
}: UseAiRouterChatArgs) => {

  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Helper to append messages (used by ChatInterface when handling actions)
  const appendMessage = useCallback((message: ChatMessage) => {
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
  const sendMessage = useCallback(async (
    content: string,
    fileIds: string[] = [],
    imageIds: string[] = []
  ) => {
    if (!sessionId || !accessToken || state.isSending) return;

    // --- State Setup & Optimistic UI ---
    const userMessage: ChatMessage = {
      id: generateTempId(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      metadata: { attached_file_ids: fileIds, attached_image_ids: imageIds },
    };

    const assistantMessageId = generateTempId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      metadata: { isStreaming: true },
    };

    dispatch({ type: 'SEND_START', payload: { userMessage, assistantPlaceholder } });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Determine the hint reliably using the imported configuration
    let providerHint = 'auto';
    if (selectedModel !== 'auto' && MODEL_CONFIGS[selectedModel]) {
        providerHint = MODEL_CONFIGS[selectedModel].providerKey;
    }

    try {
      const payload = {
        sessionId,
        userMessage: content,
        imageIds,
        providerHint,
        spaceId,
        // memories: [] // Add relevant memories if applicable
      };

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

      // Handle non-OK responses (including those returned after retries failed)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Invalid error response format' }));
        debugLog('❌ Response not OK:', { status: response.status, statusText: response.statusText, errorData });
        // This catches the specific "TypeError: Cannot read properties of undefined (reading 'provider')" if the backend returns it
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty, cannot stream.');
      }

      // --- Stream Processing Loop (SSE) ---
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE messages MUST be separated by double newlines
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep the last partial event in the buffer

        for (const event of events) {
          // Ensure it's a data event (ignore comments or empty lines)
          if (!event.startsWith('data: ')) continue;

          try {
            // Parse the JSON data payload (removing 'data: ')
            const data: SSEMessage = JSON.parse(event.substring(6));

            switch (data.type) {
              case 'text':
                if (data.content) {
                    dispatch({ type: 'STREAM_CHUNK', payload: { content: data.content, messageId: assistantMessageId } });
                }
                break;

              case 'progress':
                if (data.progress !== undefined && data.step) {
                    dispatch({ type: 'PROGRESS_UPDATE', payload: { progress: data.progress, step: data.step } });
                }
                break;

              case 'model_switch':
                 if (data.provider && data.model) {
                    dispatch({ type: 'MODEL_SWITCH', payload: { messageId: assistantMessageId, provider: data.provider, model: data.model, metadata: data.metadata }});
                 }
                break;

              case 'action_request':
                if (onActionRequest && data.action) {
                    // Handle AI-requested actions (e.g., save_schema) asynchronously
                    onActionRequest(data.action, data.args, assistantMessageId, appendMessage).catch(err => {
                        debugLog("❌ Action failed", err);
                        // Optionally dispatch a system message if the action fails
                    });
                }
                break;

              case 'error':
                // The backend signaled an error during the stream
                throw new Error(data.content || 'Stream encountered an internal error');

              case 'done':
                // Stream finished naturally
                break;
            }
          } catch (parseError) {
            debugLog('Error parsing SSE data:', { parseError, event });
            // Optionally dispatch a warning, but don't necessarily kill the stream for a single bad parse
          }
        }
      }

      // If loop finishes successfully
      dispatch({ type: 'STREAM_END', payload: { messageId: assistantMessageId } });

    } catch (err) {
      debugLog('❌ CATCH BLOCK ERROR:', err);

      // Handle aborts gracefully (don't show an error state, just stop streaming)
      if (err instanceof Error && err.name === 'AbortError') {
        dispatch({ type: 'STREAM_END', payload: { messageId: assistantMessageId } });
        return;
      }

      const error = err instanceof Error ? err : new Error('An unknown error occurred during send/stream.');
      // Dispatch error, linking it to the assistant message
      dispatch({ type: 'ERROR', payload: { error, messageId: assistantMessageId } });

    } finally {
      abortControllerRef.current = null;
    }
  }, [sessionId, accessToken, state.isSending, selectedModel, spaceId, onActionRequest, appendMessage]);

  const clearMessages = useCallback(() => {
    if (state.isSending) return;
    dispatch({ type: 'CLEAR_MESSAGES' });
    // Note: A separate API call might be needed to clear backend history if required.
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