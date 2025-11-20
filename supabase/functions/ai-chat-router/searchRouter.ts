import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface SearchQueryParams {
  query: string;
  conversationId: string;
  userId: string;
  messages: any[];
  supabase: SupabaseClient;
  corsHeaders: Record<string, string>;
}

export async function handleSearchQuery(params: SearchQueryParams): Promise<Response> {
  const { query, conversationId, userId, messages, supabase, corsHeaders } = params;

  try {
    console.log('[ROUTER-DEBUG] ========== SEARCH QUERY HANDLER ==========');
    console.log('[ROUTER-DEBUG] Query:', query);
    console.log('[ROUTER-DEBUG] Conversation ID:', conversationId);
    console.log('[ROUTER-DEBUG] User ID:', userId);

    const searchPayload = {
      query,
      conversation_id: conversationId,
      session_id: conversationId,
      trigger_source: 'auto'
    };

    console.log('[ROUTER-DEBUG] Search payload:', JSON.stringify(searchPayload, null, 2));

    const searchResponse = await supabase.functions.invoke('perplexity-search', {
      body: searchPayload
    });

    console.log('[ROUTER-DEBUG] Search response status:', searchResponse.error ? 'ERROR' : 'SUCCESS');
    if (searchResponse.error) {
      console.error('[ROUTER-DEBUG] Search error:', JSON.stringify(searchResponse.error, null, 2));
    }
    console.log('[ROUTER-DEBUG] Search response data:', JSON.stringify(searchResponse.data, null, 2));

    if (searchResponse.error) throw new Error(`Search error: ${searchResponse.error.message}`);

    const { search_summary, references, metadata } = searchResponse.data;

    console.log('[ROUTER-DEBUG] Extracted data:', {
      search_summary: search_summary?.substring(0, 100),
      references_count: references?.length || 0,
      metadata
    });

    if (conversationId) {
      await supabase.from('ai_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: search_summary,
        model: metadata?.model_used || 'sonar',
        provider: 'perplexity',
        metadata: { references, metadata, search_query: query }
      });
    }

    return new Response(JSON.stringify({
      content: search_summary,
      sources: references,
      metadata,
      isSearchResult: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Search error:', error);
    return new Response(JSON.stringify({
      error: 'Search unavailable',
      content: "Search temporarily unavailable.",
      details: error.message
    }), {status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json'}});
  }
}