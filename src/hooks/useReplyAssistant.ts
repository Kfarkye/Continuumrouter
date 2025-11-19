import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';
import {
  ReplyThread,
  ReplyMessage,
  ClinicianProfile,
  ClinicianReplyContext,
  CommunicationProfile
} from '../types';

interface UseReplyAssistantReturn {
  threads: ReplyThread[];
  currentThread: ReplyThread | null;
  messages: ReplyMessage[];
  clinicians: ClinicianProfile[];
  isLoading: boolean;
  isGenerating: boolean;
  createThread: (title: string, projectId?: string) => Promise<string>;
  selectThread: (threadId: string) => void;
  deleteThread: (threadId: string) => Promise<void>;
  generateReply: (clinicianId: string, incomingText: string, userGoal?: string) => Promise<{
    reply_1: string;
    reply_2: string;
    message_id: string;
  } | null>;
  selectReply: (messageId: string, selectedReply: string) => Promise<void>;
  saveUserInput: (clinicianId: string, incomingText: string) => Promise<void>;
  getClinicianContext: (clinicianId: string) => Promise<ClinicianReplyContext | null>;
  updateCommunicationProfile: (clinicianId: string, style: string, notes?: string) => Promise<void>;
  logInteraction: (clinicianId: string, type: string, summary?: string) => Promise<void>;
}

export function useReplyAssistant(userId: string): UseReplyAssistantReturn {
  const [threads, setThreads] = useState<ReplyThread[]>([]);
  const [currentThread, setCurrentThread] = useState<ReplyThread | null>(null);
  const [messages, setMessages] = useState<ReplyMessage[]>([]);
  const [clinicians, setClinicians] = useState<ClinicianProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadThreads = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('reply_threads')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setThreads(data || []);
    } catch (error) {
      console.error('Error loading threads:', error);
      toast.error('Failed to load threads');
    }
  }, [userId]);

  const loadClinicians = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clinician_profiles')
        .select('*')
        .eq('user_id', userId)
        .order('full_name');

      if (error) throw error;
      setClinicians(data || []);
    } catch (error) {
      console.error('Error loading clinicians:', error);
      toast.error('Failed to load clinicians');
    }
  }, [userId]);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from('reply_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([loadThreads(), loadClinicians()]);
      setIsLoading(false);
    };

    if (userId) {
      init();
    }
  }, [userId, loadThreads, loadClinicians]);

  useEffect(() => {
    if (currentThread) {
      loadMessages(currentThread.id);
    } else {
      setMessages([]);
    }
  }, [currentThread, loadMessages]);

  const createThread = useCallback(async (title: string, projectId?: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('reply_threads')
        .insert({
          user_id: userId,
          title,
          project_id: projectId || null
        })
        .select()
        .single();

      if (error) throw error;

      await loadThreads();
      setCurrentThread(data);
      toast.success('Thread created');
      return data.id;
    } catch (error) {
      console.error('Error creating thread:', error);
      toast.error('Failed to create thread');
      throw error;
    }
  }, [userId, loadThreads]);

  const selectThread = useCallback((threadId: string) => {
    const thread = threads.find(t => t.id === threadId);
    if (thread) {
      setCurrentThread(thread);
    }
  }, [threads]);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      const { error } = await supabase
        .from('reply_threads')
        .delete()
        .eq('id', threadId);

      if (error) throw error;

      if (currentThread?.id === threadId) {
        setCurrentThread(null);
      }

      await loadThreads();
      toast.success('Thread deleted');
    } catch (error) {
      console.error('Error deleting thread:', error);
      toast.error('Failed to delete thread');
    }
  }, [currentThread, loadThreads]);

  const generateReply = useCallback(async (
    clinicianId: string,
    incomingText: string,
    userGoal?: string
  ): Promise<{ reply_1: string; reply_2: string; message_id: string } | null> => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-generator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            clinician_id: clinicianId,
            user_id: userId,
            incoming_text: incomingText,
            user_goal: userGoal,
            thread_id: currentThread?.id
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate reply');
      }

      const result = await response.json();

      if (currentThread) {
        await loadMessages(currentThread.id);
      }

      toast.success('Reply options generated!');
      return {
        reply_1: result.reply_1,
        reply_2: result.reply_2,
        message_id: result.message_id
      };
    } catch (error) {
      console.error('Error generating reply:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate reply');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [userId, currentThread, loadMessages]);

  const selectReply = useCallback(async (messageId: string, selectedReply: string) => {
    try {
      const { error } = await supabase
        .from('reply_messages')
        .update({ selected_reply: selectedReply })
        .eq('id', messageId);

      if (error) throw error;

      if (currentThread) {
        await loadMessages(currentThread.id);
      }

      toast.success('Reply selected');
    } catch (error) {
      console.error('Error selecting reply:', error);
      toast.error('Failed to save selection');
    }
  }, [currentThread, loadMessages]);

  const saveUserInput = useCallback(async (clinicianId: string, incomingText: string) => {
    try {
      const { error } = await supabase
        .from('reply_messages')
        .insert({
          thread_id: currentThread?.id || null,
          user_id: userId,
          clinician_id: clinicianId,
          message_type: 'user_input',
          incoming_text: incomingText,
          metadata: {}
        });

      if (error) throw error;

      if (currentThread) {
        await loadMessages(currentThread.id);
      }
    } catch (error) {
      console.error('Error saving user input:', error);
      toast.error('Failed to save message');
    }
  }, [userId, currentThread, loadMessages]);

  const getClinicianContext = useCallback(async (clinicianId: string): Promise<ClinicianReplyContext | null> => {
    try {
      const { data, error } = await supabase
        .rpc('get_clinician_reply_context', {
          p_clinician_id: clinicianId,
          p_user_id: userId
        });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error getting clinician context:', error);
      return null;
    }
  }, [userId]);

  const updateCommunicationProfile = useCallback(async (
    clinicianId: string,
    style: string,
    notes?: string
  ) => {
    try {
      const { data: existing } = await supabase
        .from('clinician_communication_profiles')
        .select('id')
        .eq('clinician_id', clinicianId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('clinician_communication_profiles')
          .update({
            communication_style: style,
            notes: notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('clinician_id', clinicianId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clinician_communication_profiles')
          .insert({
            clinician_id: clinicianId,
            user_id: userId,
            communication_style: style,
            notes: notes || null
          });

        if (error) throw error;
      }

      toast.success('Communication profile updated');
    } catch (error) {
      console.error('Error updating communication profile:', error);
      toast.error('Failed to update profile');
    }
  }, [userId]);

  const logInteraction = useCallback(async (
    clinicianId: string,
    type: string,
    summary?: string
  ) => {
    try {
      const { error } = await supabase
        .from('clinician_interactions')
        .insert({
          clinician_id: clinicianId,
          user_id: userId,
          interaction_type: type,
          interaction_summary: summary || null
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging interaction:', error);
    }
  }, [userId]);

  return {
    threads,
    currentThread,
    messages,
    clinicians,
    isLoading,
    isGenerating,
    createThread,
    selectThread,
    deleteThread,
    generateReply,
    selectReply,
    saveUserInput,
    getClinicianContext,
    updateCommunicationProfile,
    logInteraction
  };
}
