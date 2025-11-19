import { getSupabase } from '../lib/supabaseClient';

export interface ChatTurn {
    id: string;
    role: 'user' | 'model' | 'system';
    text: string;
    timestamp: Date;
    attachment?: Attachment;
    groundingMetadata?: GroundingMetadata;
}

export interface Attachment {
    name: string;
    content: string;
}

export interface GroundingMetadata {
    searchQueries?: string[];
    sources?: Array<{
        title: string;
        url: string;
        snippet?: string;
    }>;
}

export interface SavedSession {
    id: string;
    title: string;
    lastUpdated: Date;
}

interface MessageMetadata {
    attachment?: Attachment;
    grounding?: GroundingMetadata;
}

interface DbMessage {
    id: number;
    role: 'user' | 'assistant' | 'system';
    content: string | null;
    created_at: string;
    metadata: MessageMetadata | null;
}

const mapDbMessageToChatTurn = (m: DbMessage): ChatTurn => ({
    id: String(m.id),
    role: m.role === 'assistant' ? 'model' : (m.role === 'user' ? 'user' : 'system'),
    text: m.content || '',
    timestamp: new Date(m.created_at),
    attachment: m.metadata?.attachment ?? undefined,
    groundingMetadata: m.metadata?.grounding ?? undefined,
});

export const historyService = {

    async getSession(sessionId: string): Promise<ChatTurn[]> {
        const client = getSupabase();

        const { data, error } = await client
            .from('ai_messages')
            .select(`
                id, role, content, created_at, metadata,
                ai_conversations!inner (session_id)
            `)
            .eq('ai_conversations.session_id', sessionId)
            .in('role', ['user', 'assistant'])
            .order('id', { ascending: true });

        if (error) {
            console.error(`Error fetching messages for session ${sessionId}:`, error);
            return [];
        }

        return (data as DbMessage[] || []).map(mapDbMessageToChatTurn);
    },

    async listSessions(): Promise<SavedSession[]> {
        const client = getSupabase();

        const { data, error } = await client
            .from('ai_conversations')
            .select('session_id, title, updated_at')
            .not('title', 'is', null)
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error("Error listing sessions:", error);
            return [];
        }

        return data.map(s => ({
            id: s.session_id,
            title: s.title || 'Untitled Analysis',
            lastUpdated: new Date(s.updated_at),
        }));
    },

    async clearSession(sessionId: string): Promise<void> {
        const client = getSupabase();

        const { error } = await client
            .from('ai_conversations')
            .delete()
            .eq('session_id', sessionId);

        if (error) {
            console.error("Error deleting session:", error);
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }
};
