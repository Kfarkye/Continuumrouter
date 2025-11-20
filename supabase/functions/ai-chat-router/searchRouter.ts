import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface SearchQueryParams {
  query: string;
  conversationId: string;
  userId: string;
  messages: any[];
  supabase: SupabaseClient;
  corsHeaders: Record<string, string>;
  userToken: string;
}

export async function handleSearchQuery(params: SearchQueryParams): Promise<Response> {
  const { query, conversationId, userId, messages, supabase, corsHeaders, userToken } = params;

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
        'Authorization': `Bearer ${userToken}`,
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

    // Return as SSE stream to match the expected frontend format
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send model switch event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'model_switch',
          provider: 'perplexity',
          model: metadata?.model_used || 'sonar',
          metadata: { isSearchResult: true }
        })}\n\n`));

        // Send the search summary as text chunks
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'text',
          content: search_summary
        })}\n\n`));

        // Send done event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done'
        })}\n\n`));

        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('[ROUTER-DEBUG] ========== SEARCH ERROR ==========');
    console.error('[ROUTER-DEBUG] Error type:', error.constructor.name);
    console.error('[ROUTER-DEBUG] Error message:', error.message);
    console.error('[ROUTER-DEBUG] Error stack:', error.stack);

    // Return error as SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          content: `Search temporarily unavailable: ${error.message}`
        })}\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
}