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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[ROUTER-DEBUG] Calling perplexity-search directly via fetch...');

    const searchFetchResponse = await fetch(`${supabaseUrl}/functions/v1/perplexity-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(searchPayload)
    });

    console.log('[ROUTER-DEBUG] Fetch response status:', searchFetchResponse.status);

    if (!searchFetchResponse.ok) {
      const errorText = await searchFetchResponse.text();
      console.error('[ROUTER-DEBUG] Fetch error response:', errorText);
      throw new Error(`Search function returned ${searchFetchResponse.status}: ${errorText}`);
    }

    const searchData = await searchFetchResponse.json();
    console.log('[ROUTER-DEBUG] Search response data:', JSON.stringify(searchData, null, 2));

    const searchResponse = { data: searchData, error: null };

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
    console.error('[ROUTER-DEBUG] ========== SEARCH ERROR ==========');
    console.error('[ROUTER-DEBUG] Error type:', error.constructor.name);
    console.error('[ROUTER-DEBUG] Error message:', error.message);
    console.error('[ROUTER-DEBUG] Error stack:', error.stack);

    return new Response(JSON.stringify({
      error: 'Search unavailable',
      content: "Search temporarily unavailable.",
      details: error.message,
      debug_info: {
        error_type: error.constructor.name,
        query_received: query,
        conversation_id: conversationId,
        user_id: userId
      }
    }), {status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json'}});
  }
}