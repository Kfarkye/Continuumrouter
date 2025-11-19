import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[CRITICAL] Supabase environment variables (VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY) are not set.");
}

const supabase: SupabaseClient | null = (SUPABASE_URL && SUPABASE_ANON_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export const Config = {
    EDGE_FUNCTION_URL: SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-chat-router` : '',
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
};

export const getSupabase = (): SupabaseClient => {
    if (!supabase) {
        throw new Error("Supabase client is not initialized. Check environment variables.");
    }
    return supabase;
};

export { supabase };

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const client = getSupabase();

    if (!Config.SUPABASE_ANON_KEY) {
        throw new Error("Supabase ANON key is missing from configuration.");
    }

    const { data: { session }, error } = await client.auth.getSession();

    if (error) {
        console.warn("Could not retrieve active Supabase session, proceeding anonymously:", error);
    }

    const token = session?.access_token || Config.SUPABASE_ANON_KEY;

    return {
        'Content-Type': 'application/json',
        'Apikey': Config.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
    };
};
