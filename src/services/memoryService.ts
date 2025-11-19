import { supabase } from '../lib/supabaseClient';
import type { EffectiveContext, InteractionMode } from '../lib/contextResolver';

const MEMORY_LANES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-lanes`;

export interface Memory {
  id: string;
  space_id: string;
  user_id: string;
  content: string;
  kind: 'fact' | 'preference' | 'task' | 'context';
  metadata: Record<string, any>;
  similarity?: number;
  source_conversation_id?: string;
  source_message_id?: number;
  mode?: InteractionMode;
  clinician_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface CaptureMemoryResult {
  captured: number;
  memories: Memory[];
}

export interface RetrieveMemoriesResult {
  memories: Memory[];
}

async function getConversationId(sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to get conversation ID:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.warn('Error fetching conversation ID:', err);
    return null;
  }
}

async function getLastMessageId(conversationId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Failed to get last message ID:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.warn('Error fetching last message ID:', err);
    return null;
  }
}

export async function captureMemory(
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  accessToken: string,
  projectId?: string,
  spaceId?: string,
  context?: EffectiveContext
): Promise<CaptureMemoryResult | null> {
  try {
    const conversationId = await getConversationId(sessionId);
    if (!conversationId) {
      console.warn('Cannot capture memory: conversation ID not found');
      return null;
    }

    const messageId = await getLastMessageId(conversationId);
    if (!messageId) {
      console.warn('Cannot capture memory: message ID not found');
      return null;
    }

    const response = await fetch(MEMORY_LANES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        operation: 'capture',
        conversationId: conversationId,
        messageId: messageId,
        userMessage: userMessage,
        assistantResponse: assistantResponse,
        spaceId: spaceId,
        mode: context?.effectiveMode,
        clinicianId: context?.clinicianId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Memory capture failed:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    console.log(`✓ Captured ${result.captured} memories from conversation`);
    return result;
  } catch (err) {
    console.warn('Memory capture error:', err);
    return null;
  }
}

export async function retrieveMemories(
  query: string,
  accessToken: string,
  projectId?: string,
  spaceId?: string,
  limit: number = 5,
  context?: EffectiveContext
): Promise<Memory[]> {
  try {
    const response = await fetch(MEMORY_LANES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        operation: 'retrieve',
        query: query,
        spaceId: spaceId,
        limit: limit,
        mode: context?.effectiveMode,
        clinicianId: context?.clinicianId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Memory retrieval failed:', response.status, errorText);
      return [];
    }

    const memories = await response.json();

    if (Array.isArray(memories) && memories.length > 0) {
      console.log(`✓ Retrieved ${memories.length} relevant memories`);
    }

    return Array.isArray(memories) ? memories : [];
  } catch (err) {
    console.warn('Memory retrieval error:', err);
    return [];
  }
}

export async function deduplicateMemories(
  accessToken: string,
  spaceId?: string
): Promise<{ deduplicated: number } | null> {
  try {
    const response = await fetch(MEMORY_LANES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        operation: 'deduplicate',
        spaceId: spaceId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Memory deduplication failed:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    if (result.deduplicated > 0) {
      console.log(`✓ Deduplicated ${result.deduplicated} memories`);
    }
    return result;
  } catch (err) {
    console.warn('Memory deduplication error:', err);
    return null;
  }
}

export async function getMemoriesForProject(
  userId: string,
  projectId: string
): Promise<Memory[]> {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch memories:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('Error fetching memories:', err);
    return [];
  }
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId);

    if (error) {
      console.warn('Failed to delete memory:', error);
      return false;
    }

    console.log('✓ Memory deleted successfully');
    return true;
  } catch (err) {
    console.warn('Error deleting memory:', err);
    return false;
  }
}
