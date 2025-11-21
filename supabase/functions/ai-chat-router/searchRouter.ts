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

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    console.log('[ROUTER-DEBUG]', requestId, '========== SEARCH QUERY HANDLER START ==========');
    console.log('[ROUTER-DEBUG]', requestId, 'Query:', query);
    console.log('[ROUTER-DEBUG]', requestId, 'Conversation ID:', conversationId);
    console.log('[ROUTER-DEBUG]', requestId, 'User ID:', userId);

    const { data: existingConversation, error: convCheckError } = await supabase
      .from('ai_conversations')
      .select('id, session_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convCheckError) {
      console.error('[ROUTER-DEBUG]', requestId, 'Conversation validation error:', convCheckError.message);
      throw new Error(`Failed to validate conversation: ${convCheckError.message}`);
    }

    if (!existingConversation) {
      console.warn('[ROUTER-DEBUG]', requestId, 'Conversation not found with ID:', conversationId);
      throw new Error(`Invalid conversation ID: ${conversationId}. Conversation does not exist in database.`);
    }

    console.log('[ROUTER-DEBUG]', requestId, 'Conversation validated:', {
      conversationId: existingConversation.id,
      sessionId: existingConversation.session_id
    });

    const searchPayload = {
      query,
      conversation_id: conversationId,
      session_id: existingConversation.session_id,
      trigger_source: 'auto'
    };

    console.log('[ROUTER-DEBUG]', requestId, 'Search payload:', JSON.stringify(searchPayload, null, 2));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    console.log('[ROUTER-DEBUG]', requestId, 'Search URL:', `${supabaseUrl}/functions/v1/perplexity-search`);
    console.log('[ROUTER-DEBUG]', requestId, 'User token length:', userToken ? userToken.length : 0);
    console.log('[ROUTER-DEBUG]', requestId, 'Calling perplexity-search via fetch...');

    const SEARCH_TIMEOUT_MS = 5000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    let searchFetchResponse;
    try {
      searchFetchResponse = await fetch(`${supabaseUrl}/functions/v1/perplexity-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`Search request timed out after ${SEARCH_TIMEOUT_MS}ms`);
      }
      throw fetchError;
    }

    console.log('[ROUTER-DEBUG]', requestId, 'Fetch response status:', searchFetchResponse.status);
    console.log('[ROUTER-DEBUG]', requestId, 'Fetch response headers:', {
      'content-type': searchFetchResponse.headers.get('content-type'),
      'content-length': searchFetchResponse.headers.get('content-length')
    });

    if (!searchFetchResponse.ok) {
      const errorText = await searchFetchResponse.text();
      console.error('[ROUTER-DEBUG]', requestId, 'Fetch error response:', errorText);
      throw new Error(`Search function returned ${searchFetchResponse.status}: ${errorText}`);
    }

    const raw = await searchFetchResponse.json();
    const afterFetch = Date.now();
    console.log('[ROUTER-DEBUG]', requestId, 'Fetch+JSON duration_ms:', afterFetch - startedAt);
    console.log('[ROUTER-DEBUG]', requestId, 'Raw search JSON:', JSON.stringify(raw, null, 2));
    console.log('[ROUTER-DEBUG]', requestId, 'Raw search JSON keys:', Object.keys(raw));

    const searchResponse = {
      data: raw.data ?? raw,
      error: raw.error ?? null,
    };

    console.log('[ROUTER-DEBUG]', requestId, 'Normalized search response status:', searchResponse.error ? 'ERROR' : 'SUCCESS');

    if (searchResponse.error) {
      console.error('[ROUTER-DEBUG]', requestId, 'Downstream search error:', JSON.stringify(searchResponse.error, null, 2));
      throw new Error(
        `Search error from perplexity-search: ${
          searchResponse.error.message ?? JSON.stringify(searchResponse.error)
        }`
      );
    }

    const { search_summary, references, metadata } = searchResponse.data ?? {};

    console.log('[ROUTER-DEBUG]', requestId, 'Extracted fields summary:', {
      search_summary_type: typeof search_summary,
      search_summary_length: search_summary?.length || 0,
      references_is_array: Array.isArray(references),
      references_count: Array.isArray(references) ? references.length : 0,
      metadata_type: typeof metadata,
      metadata_keys: metadata ? Object.keys(metadata) : []
    });

    if (!search_summary || typeof search_summary !== 'string') {
      console.error('[ROUTER-DEBUG]', requestId, 'Missing or invalid search_summary in search data');
      console.error('[ROUTER-DEBUG]', requestId, 'search_summary value:', search_summary);
      throw new Error('perplexity-search returned no usable search_summary');
    }

    console.log('[ROUTER-DEBUG]', requestId, 'Extracted data preview:', {
      search_summary_preview: search_summary.substring(0, 120),
      references_count: Array.isArray(references) ? references.length : 0,
      metadata
    });

    if (conversationId) {
      console.log('[ROUTER-DEBUG]', requestId, 'Inserting ai_messages row for conversation:', conversationId);
      console.log('[ROUTER-DEBUG]', requestId, 'Insert payload size:', {
        content_length: search_summary.length,
        metadata_json_length: JSON.stringify({ references, metadata, search_query: query }).length
      });

      const { data: insertData, error: insertError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: search_summary,
          model: metadata?.model_used || 'sonar',
          provider: 'perplexity',
          metadata: { references, metadata, search_query: query }
        })
        .select('id, created_at')
        .maybeSingle();

      const afterInsert = Date.now();
      console.log('[ROUTER-DEBUG]', requestId, 'Supabase insert duration_ms:', afterInsert - afterFetch);

      if (insertError) {
        console.error('[ROUTER-DEBUG]', requestId, 'ai_messages insert ERROR:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        });
        console.warn('[ROUTER-DEBUG]', requestId, 'Continuing despite insert error - user will still see results');
      } else {
        console.log('[ROUTER-DEBUG]', requestId, 'ai_messages insert SUCCESS:', insertData);
      }
    } else {
      console.log('[ROUTER-DEBUG]', requestId, 'No conversationId provided, skipping ai_messages insert');
    }

    console.log('[ROUTER-DEBUG]', requestId, 'Building SSE response stream');
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'model_switch',
          provider: 'perplexity',
          model: metadata?.model_used || 'sonar',
          metadata: { isSearchResult: true, requestId }
        })}\n\n`));

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'text',
          content: search_summary
        })}\n\n`));

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done'
        })}\n\n`));

        controller.close();
      }
    });

    const totalDuration = Date.now() - startedAt;
    console.log('[ROUTER-DEBUG]', requestId, 'Total handler duration_ms:', totalDuration);
    console.log('[ROUTER-DEBUG]', requestId, '========== SEARCH QUERY HANDLER SUCCESS ==========');

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId
      }
    });

  } catch (error: any) {
    const errorDuration = Date.now() - startedAt;
    console.error('[ROUTER-DEBUG]', requestId, '========== SEARCH ERROR ==========');
    console.error('[ROUTER-DEBUG]', requestId, 'Error type:', error.constructor.name);
    console.error('[ROUTER-DEBUG]', requestId, 'Error message:', error.message);
    console.error('[ROUTER-DEBUG]', requestId, 'Error stack:', error.stack);
    console.error('[ROUTER-DEBUG]', requestId, 'Error occurred at duration_ms:', errorDuration);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              request_id: requestId,
              content: `Search temporarily unavailable: ${error.message}`
            })}\n\n`
          )
        );
        controller.close();
      }
    });

    return new Response(stream, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId
      }
    });
  }
}
