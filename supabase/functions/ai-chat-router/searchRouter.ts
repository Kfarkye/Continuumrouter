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
    console.log('🔍 Calling perplexity-search');

    const searchResponse = await supabase.functions.invoke('perplexity-search', {
      body: {query, conversationId, userId}
    });

    if (searchResponse.error) throw new Error(`Search error: ${searchResponse.error.message}`);

    const { answer, sources, usage, model } = searchResponse.data;

    if (conversationId) {
      await supabase.from('ai_messages').insert({
        conversation_id: conversationId, role: 'assistant', content: answer,
        model: model, provider: 'perplexity',
        metadata: {sources, usage, search_query: query}
      });
    }

    return new Response(JSON.stringify({content: answer, sources, usage, model, isSearchResult: true}), {
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