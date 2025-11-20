import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
const CACHE_TTL_HOURS = 24;
const ESTIMATED_COST_PER_SEARCH = 0.03;

if (!PERPLEXITY_API_KEY) {
  console.error('[CRITICAL] PERPLEXITY_API_KEY not configured');
}

interface SearchRequest {
  query: string;
  max_results?: number;
  search_context_size?: 'low' | 'medium' | 'high';
  model?: 'sonar' | 'sonar-pro';
  published_after?: string;
  search_domain_filter?: string[];
  session_id?: string;
  conversation_id?: string;
  trigger_source?: 'auto' | 'manual';
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: Array<{
    url: string;
    title?: string;
  }>;
}

function generateQueryHash(query: string, model: string): string {
  const normalized = query.toLowerCase().trim();
  return createHash('sha256').update(`${normalized}:${model}`).digest('hex');
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const SEARCH_FEE = 0.005;
  
  if (model === 'sonar-pro') {
    const INPUT_COST_PER_1M = 3.00;
    const OUTPUT_COST_PER_1M = 15.00;
    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
    return SEARCH_FEE + inputCost + outputCost;
  } else {
    const TOKEN_COST_PER_1M = 1.00;
    const totalTokens = inputTokens + outputTokens;
    const tokenCost = (totalTokens / 1_000_000) * TOKEN_COST_PER_1M;
    return SEARCH_FEE + tokenCost;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!PERPLEXITY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Search service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: SearchRequest = await req.json();
    const {
      query,
      max_results = 5,
      search_context_size = 'medium',
      model = 'sonar',
      published_after,
      search_domain_filter,
      session_id,
      conversation_id,
      trigger_source = 'manual'
    } = payload;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SEARCH-DEBUG] ========== NEW SEARCH REQUEST ==========`);
    console.log(`[SEARCH-DEBUG] User ID: ${user.id}`);
    console.log(`[SEARCH-DEBUG] Query: "${query}"`);
    console.log(`[SEARCH-DEBUG] Model: ${model}`);
    console.log(`[SEARCH-DEBUG] Trigger: ${trigger_source}`);
    console.log(`[SEARCH-DEBUG] Max Results: ${max_results}`);
    console.log(`[SEARCH-DEBUG] Context Size: ${search_context_size}`);
    console.log(`[SEARCH-DEBUG] Published After: ${published_after || 'none'}`);
    console.log(`[SEARCH-DEBUG] Domain Filter: ${search_domain_filter || 'none'}`);

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: quotaCheck, error: quotaError } = await supabaseAdmin.rpc('check_quota', {
      p_user_id: user.id,
      p_estimated_cost: ESTIMATED_COST_PER_SEARCH
    });

    if (quotaError) {
      console.error('[Quota Check Failed]', quotaError);
      throw new Error('Failed to check quota');
    }

    if (quotaCheck && quotaCheck.length > 0 && !quotaCheck[0].allowed) {
      return new Response(
        JSON.stringify({
          error: 'Quota exceeded',
          message: quotaCheck[0].message,
          remaining_usd: quotaCheck[0].remaining_usd
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queryHash = generateQueryHash(query, model);

    const { data: cachedResult } = await supabaseAdmin
      .from('search_cache')
      .select('*')
      .eq('query_hash', queryHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (cachedResult) {
      console.log(`[Cache Hit] Hash: ${queryHash}`);

      await supabaseAdmin
        .from('search_cache')
        .update({
          hit_count: cachedResult.hit_count + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq('query_hash', queryHash);

      const { data: queryRecord } = await supabaseAdmin
        .from('search_queries')
        .insert({
          user_id: user.id,
          session_id,
          conversation_id,
          query_text: query,
          provider_model: model,
          search_triggered_by: trigger_source,
          tokens_input: 0,
          tokens_output: 0,
          latency_ms: Date.now() - startTime,
          cost_usd: 0,
          cache_hit: true
        })
        .select('id')
        .single();

      const response = cachedResult.response_payload;
      response.metadata = {
        ...response.metadata,
        cache_hit: true,
        latency_ms: Date.now() - startTime,
        query_id: queryRecord?.id
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SEARCH-DEBUG] Cache Miss - Query Hash: ${queryHash}`);
    console.log(`[SEARCH-DEBUG] Calling Perplexity API...`);

    const currentDate = new Date();
    const dateString = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const fullDateString = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const enhancedSystemPrompt = `You are a precise research assistant focused on current, accurate information.

IMPORTANT CONTEXT:
- Today's date is: ${fullDateString} (${dayOfWeek})
- ISO date: ${dateString}

ACCURACY REQUIREMENTS:
1. When asked about "today's" events, ONLY include events happening on ${dateString}
2. Do NOT include events from past dates or future dates
3. If you mention dates in your response, verify they match ${dateString}
4. Prioritize official sources and real-time data
5. If information is uncertain or unavailable, state that clearly
6. Cite all sources with clear attribution

If the user asks about time-sensitive information (today, tonight, now), emphasize recency and accuracy over comprehensiveness.`;

    let enhancedQuery = query;

    const timeKeywords = ['today', 'tonight', 'this evening', 'now', 'current'];
    const containsTimeReference = timeKeywords.some(keyword =>
      query.toLowerCase().includes(keyword)
    );

    if (containsTimeReference) {
      enhancedQuery = `${query}\n\nIMPORTANT: Only provide information for ${fullDateString} (${dateString}). Exclude past and future dates.`;
      console.log(`[SEARCH-DEBUG] Enhanced query with date context`);
    }

    console.log(`[SEARCH-DEBUG] Original Query: "${query}"`);
    console.log(`[SEARCH-DEBUG] Enhanced Query: "${enhancedQuery}"`);
    console.log(`[SEARCH-DEBUG] Date Context: ${fullDateString}`);

    const messages = [{
      role: 'system',
      content: enhancedSystemPrompt
    }, {
      role: 'user',
      content: enhancedQuery
    }];

    const perplexityPayload: any = {
      model: model === 'sonar-pro' ? 'sonar-pro' : 'sonar',
      messages
    };

    console.log(`[SEARCH-DEBUG] Perplexity Payload:`, JSON.stringify(perplexityPayload, null, 2));

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(perplexityPayload)
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('[Perplexity API Error]', perplexityResponse.status, errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const perplexityData: PerplexityResponse = await perplexityResponse.json();

    console.log(`[SEARCH-DEBUG] ========== PERPLEXITY RAW RESPONSE ==========`);
    console.log(`[SEARCH-DEBUG] Status: ${perplexityResponse.status}`);
    console.log(`[SEARCH-DEBUG] Response Data:`, JSON.stringify(perplexityData, null, 2));
    console.log(`[SEARCH-DEBUG] Citations count: ${perplexityData.citations?.length || 0}`);
    console.log(`[SEARCH-DEBUG] Content length: ${perplexityData.choices[0]?.message?.content?.length || 0}`);

    const inputTokens = perplexityData.usage?.prompt_tokens || 0;
    const outputTokens = perplexityData.usage?.completion_tokens || 0;
    const actualCost = calculateCost(model, inputTokens, outputTokens);
    const latency = Date.now() - startTime;

    const searchSummary = perplexityData.choices[0]?.message?.content || '';
    const citations = perplexityData.citations || [];

    console.log(`[SEARCH-DEBUG] ========== PROCESSING RESULTS ==========`);
    console.log(`[SEARCH-DEBUG] Search Summary:`, searchSummary.substring(0, 200));
    console.log(`[SEARCH-DEBUG] Citations:`, JSON.stringify(citations, null, 2));

    const datePattern = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b/gi;
    const foundDates = searchSummary.match(datePattern) || [];

    if (foundDates.length > 0) {
      console.log(`[SEARCH-DEBUG] ========== DATE VERIFICATION ==========`);
      console.log(`[SEARCH-DEBUG] Expected Date: ${dateString}`);
      console.log(`[SEARCH-DEBUG] Dates Found in Response:`, foundDates);

      const unexpectedDates = foundDates.filter(date => {
        const normalized = new Date(date).toISOString().split('T')[0];
        return normalized !== dateString && !isNaN(new Date(date).getTime());
      });

      if (unexpectedDates.length > 0) {
        console.warn(`[SEARCH-DEBUG] ⚠️  WARNING: Response contains dates other than today:`, unexpectedDates);
        console.warn(`[SEARCH-DEBUG] This may indicate stale or inaccurate information`);
      } else {
        console.log(`[SEARCH-DEBUG] ✓ Date verification passed`);
      }
    }

    const references = citations.slice(0, max_results).map((citation, index) => ({
      url: citation.url,
      title: citation.title || extractDomain(citation.url),
      snippet: '',
      publish_date: undefined
    }));

    const { data: queryRecord, error: insertError } = await supabaseAdmin
      .from('search_queries')
      .insert({
        user_id: user.id,
        session_id,
        conversation_id,
        query_text: query,
        provider_model: model,
        search_triggered_by: trigger_source,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        latency_ms: latency,
        cost_usd: actualCost,
        cache_hit: false
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Query Insert Error]', insertError);
    }

    const queryId = queryRecord?.id;

    if (queryId && references.length > 0) {
      const resultsToInsert = references.map((ref, index) => ({
        query_id: queryId,
        source_url: ref.url,
        source_title: ref.title,
        source_snippet: ref.snippet,
        source_domain: extractDomain(ref.url),
        published_date: ref.publish_date,
        rank: index + 1
      }));

      await supabaseAdmin
        .from('search_results')
        .insert(resultsToInsert);
    }

    await supabaseAdmin.rpc('increment_usage', {
      p_user_id: user.id,
      p_actual_cost: actualCost,
      p_search_query_id: queryId
    });

    const responsePayload = {
      search_summary: searchSummary,
      references,
      data_freshness: new Date().toISOString(),
      metadata: {
        query_id: queryId,
        model_used: model,
        tokens_input: inputTokens,
        tokens_output: outputTokens,
        latency_ms: latency,
        cost_usd: actualCost,
        cache_hit: false
      }
    };

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    await supabaseAdmin
      .from('search_cache')
      .upsert({
        query_hash: queryHash,
        query_text: query,
        response_payload: responsePayload,
        model_used: model,
        expires_at: expiresAt.toISOString(),
        hit_count: 0
      });

    console.log(`[SEARCH-DEBUG] ========== FINAL RESPONSE ==========`);
    console.log(`[SEARCH-DEBUG] Response Payload:`, JSON.stringify(responsePayload, null, 2));
    console.log(`[SEARCH-DEBUG] Total Latency: ${latency}ms`);
    console.log(`[SEARCH-DEBUG] Cost: $${actualCost.toFixed(4)}`);

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Search Function Error]', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});