/**
 * Conversation Mode Hook
 *
 * Manages conversation lifecycle with mode isolation.
 * Ensures conversations are tagged with mode and starts new conversations on mode transitions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { EffectiveContext, InteractionMode } from '../lib/contextResolver';
import { requiresNewConversation } from '../lib/contextResolver';

interface ConversationModeState {
  conversationId: string | null;
  sessionId: string | null;
  isNewConversation: boolean;
  previousMode: InteractionMode | null;
}

export function useConversationMode(context: EffectiveContext | null) {
  const [state, setState] = useState<ConversationModeState>({
    conversationId: null,
    sessionId: null,
    isNewConversation: false,
    previousMode: null,
  });

  const previousModeRef = useRef<InteractionMode | null>(null);

  /**
   * Creates a new conversation with mode tagging
   */
  const createConversation = useCallback(async (): Promise<{
    conversationId: string;
    sessionId: string;
  } | null> => {
    if (!context) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          session_id: sessionId,
          space_id: context.spaceId,
          clinician_id: context.clinicianId,
          mode: context.effectiveMode,
          title: 'New Conversation',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating conversation:', error);
        return null;
      }

      console.log(`Created new conversation in ${context.effectiveMode} mode`);

      return {
        conversationId: data.id,
        sessionId,
      };
    } catch (error) {
      console.error('Exception creating conversation:', error);
      return null;
    }
  }, [context]);

  /**
   * Loads existing conversation for the current context and mode
   */
  const loadExistingConversation = useCallback(async (): Promise<{
    conversationId: string;
    sessionId: string;
  } | null> => {
    if (!context) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Find most recent conversation matching the current mode and space
      let query = supabase
        .from('ai_conversations')
        .select('id, session_id')
        .eq('user_id', user.id)
        .eq('mode', context.effectiveMode)
        .order('created_at', { ascending: false })
        .limit(1);

      // Filter by space/clinician based on context
      if (context.clinicianId) {
        query = query.eq('clinician_id', context.clinicianId);
      } else if (context.spaceId) {
        query = query.eq('space_id', context.spaceId);
      } else {
        query = query.is('space_id', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error loading conversation:', error);
        return null;
      }

      if (data) {
        console.log(`Loaded existing conversation in ${context.effectiveMode} mode`);
        return {
          conversationId: data.id,
          sessionId: data.session_id,
        };
      }

      return null;
    } catch (error) {
      console.error('Exception loading conversation:', error);
      return null;
    }
  }, [context]);

  /**
   * Initializes or switches conversation based on mode
   */
  const initializeConversation = useCallback(async (forceNew: boolean = false) => {
    if (!context) return;

    const shouldStartNew =
      forceNew ||
      !state.conversationId ||
      requiresNewConversation(previousModeRef.current, context.effectiveMode);

    if (shouldStartNew) {
      // Try to load existing conversation first (unless forced new)
      let conversation = forceNew ? null : await loadExistingConversation();

      // If no existing conversation, create new one
      if (!conversation) {
        conversation = await createConversation();
      }

      if (conversation) {
        setState({
          conversationId: conversation.conversationId,
          sessionId: conversation.sessionId,
          isNewConversation: true,
          previousMode: previousModeRef.current,
        });

        previousModeRef.current = context.effectiveMode;
      }
    }
  }, [context, state.conversationId, createConversation, loadExistingConversation]);

  // Initialize conversation when context changes
  useEffect(() => {
    if (context) {
      initializeConversation();
    }
  }, [context?.effectiveMode, context?.spaceId, context?.clinicianId]);

  /**
   * Forces a new conversation (e.g., when user clicks "New Chat")
   */
  const startNewConversation = useCallback(async () => {
    await initializeConversation(true);
  }, [initializeConversation]);

  /**
   * Updates conversation title
   */
  const updateConversationTitle = useCallback(async (title: string) => {
    if (!state.conversationId) return;

    const { error } = await supabase
      .from('ai_conversations')
      .update({ title })
      .eq('id', state.conversationId);

    if (error) {
      console.error('Error updating conversation title:', error);
    }
  }, [state.conversationId]);

  /**
   * Marks the new conversation flag as read
   */
  const acknowledgeNewConversation = useCallback(() => {
    setState(prev => ({ ...prev, isNewConversation: false }));
  }, []);

  return {
    conversationId: state.conversationId,
    sessionId: state.sessionId,
    isNewConversation: state.isNewConversation,
    startNewConversation,
    updateConversationTitle,
    acknowledgeNewConversation,
  };
}

/**
 * Hook to get conversation history filtered by mode
 */
export function useConversationHistory(context: EffectiveContext | null) {
  const [conversations, setConversations] = useState<Array<{
    id: string;
    title: string;
    mode: InteractionMode;
    created_at: string;
    message_count: number;
  }>>([]);

  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!context) return;

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('ai_conversations')
        .select(`
          id,
          title,
          mode,
          created_at,
          ai_messages (count)
        `)
        .eq('user_id', user.id)
        .eq('mode', context.effectiveMode)
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by space/clinician based on context
      if (context.clinicianId) {
        query = query.eq('clinician_id', context.clinicianId);
      } else if (context.spaceId) {
        query = query.eq('space_id', context.spaceId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading conversation history:', error);
        return;
      }

      const formatted = (data || []).map(conv => ({
        id: conv.id,
        title: conv.title,
        mode: conv.mode as InteractionMode,
        created_at: conv.created_at,
        message_count: Array.isArray(conv.ai_messages)
          ? conv.ai_messages.length
          : (conv.ai_messages as any)?.count || 0,
      }));

      setConversations(formatted);
    } catch (error) {
      console.error('Exception loading conversation history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [context]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    conversations,
    isLoading,
    refresh: loadHistory,
  };
}
