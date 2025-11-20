import { supabase } from '../lib/supabaseClient';
import type { PerplexitySearchRequest, PerplexitySearchResponse, QuotaStatus, SearchResult } from '../types';

const SEARCH_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perplexity-search`;

export interface SearchServiceOptions {
  signal?: AbortSignal;
  onProgress?: (step: string) => void;
}

export class SearchService {
  private accessToken: string | null = null;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || null;
  }

  async setAccessToken(token: string) {
    this.accessToken = token;
  }

  async search(
    request: PerplexitySearchRequest,
    options?: SearchServiceOptions
  ): Promise<PerplexitySearchResponse> {
    if (!this.accessToken) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      this.accessToken = session.access_token;
    }

    options?.onProgress?.('Checking quota...');

    try {
      console.log('[SEARCH-CLIENT-DEBUG] ========== INITIATING SEARCH ==========');
      console.log('[SEARCH-CLIENT-DEBUG] Request payload:', JSON.stringify(request, null, 2));
      console.log('[SEARCH-CLIENT-DEBUG] URL:', SEARCH_FUNCTION_URL);

      options?.onProgress?.('Searching the web...');

      const response = await fetch(SEARCH_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(request),
        signal: options?.signal,
      });

      console.log('[SEARCH-CLIENT-DEBUG] Response status:', response.status);
      console.log('[SEARCH-CLIENT-DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SEARCH-CLIENT-DEBUG] Error response body:', errorText);
        let errorData = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('[SEARCH-CLIENT-DEBUG] Failed to parse error JSON:', e);
        }

        if (response.status === 429) {
          throw new Error(`Quota exceeded: ${errorData.message || 'Search limit reached'}`);
        }

        if (response.status === 503) {
          throw new Error('Search service is currently unavailable');
        }

        throw new Error(errorData.error || `Search failed: ${response.statusText}`);
      }

      options?.onProgress?.('Processing results...');

      const responseText = await response.text();
      console.log('[SEARCH-CLIENT-DEBUG] ========== RAW RESPONSE ==========');
      console.log('[SEARCH-CLIENT-DEBUG] Response body:', responseText);

      const data: PerplexitySearchResponse = JSON.parse(responseText);
      console.log('[SEARCH-CLIENT-DEBUG] ========== PARSED DATA ==========');
      console.log('[SEARCH-CLIENT-DEBUG] Search summary length:', data.search_summary?.length || 0);
      console.log('[SEARCH-CLIENT-DEBUG] References count:', data.references?.length || 0);
      console.log('[SEARCH-CLIENT-DEBUG] Metadata:', data.metadata);

      return data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Search cancelled');
        }
        throw error;
      }
      throw new Error('An unknown error occurred during search');
    }
  }

  async getQuotaStatus(userId: string): Promise<QuotaStatus | null> {
    if (!this.accessToken) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return null;
      }
      this.accessToken = session.access_token;
    }

    const { data, error } = await supabase
      .from('organization_usage')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to fetch quota status:', error);
      return null;
    }

    const usagePercentage = (data.current_usage_usd / data.monthly_allowance_usd) * 100;

    return {
      remaining_usd: data.monthly_allowance_usd - data.current_usage_usd,
      limit_usd: data.monthly_allowance_usd,
      current_usage_usd: data.current_usage_usd,
      search_count: data.search_count,
      reset_date: data.reset_date,
      usage_percentage: Math.round(usagePercentage * 100) / 100,
      alert_80_triggered: data.alert_threshold_80,
      alert_90_triggered: data.alert_threshold_90,
    };
  }

  async getSearchHistory(userId: string, limit: number = 20) {
    const { data, error } = await supabase
      .from('search_queries')
      .select(`
        *,
        search_results (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch search history:', error);
      return [];
    }

    return data || [];
  }

  formatSearchResults(references: PerplexitySearchResponse['references']): SearchResult[] {
    return references.map((ref, index) => {
      const domain = this.extractDomain(ref.url);
      return {
        id: `search-${index}`,
        url: ref.url,
        title: ref.title,
        snippet: ref.snippet || '',
        domain,
        published_date: ref.publish_date,
        rank: index + 1,
        favicon_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      };
    });
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  processMarkdownWithCitations(
    content: string,
    references: PerplexitySearchResponse['references']
  ): string {
    let processedContent = content;

    references.forEach((ref, index) => {
      const citationNumber = index + 1;
      const citationPattern = new RegExp(`\\[${citationNumber}\\]`, 'g');

      const footnoteDefinition = `\n\n[^${citationNumber}]: [${ref.title}](${ref.url})`;

      if (!processedContent.includes(footnoteDefinition)) {
        processedContent += footnoteDefinition;
      }
    });

    return processedContent;
  }
}

export interface SearchIntent {
  requiresSearch: boolean;
  confidence: 'high' | 'medium' | 'low';
  complexity?: 'high' | 'low';
  reason: string;
}

export async function detectSearchIntent(query: string, previousMessages?: any[]): Promise<SearchIntent> {
  const normalizedQuery = query.toLowerCase().trim();

  // Exclusion patterns - these should NOT trigger search
  const exclusionPatterns = [
    // Code-related queries (refactor, enhance, improve code)
    /\b(refactor|optimize|improve|enhance|fix|debug|modify|update)\b.*\b(code|function|class|component|method|variable)\b/i,
    /\b(add|create|write|generate)\b.*\b(function|class|component|interface|type)\b/i,
    // Design/architecture discussions without time-sensitivity
    /\b(design|architecture|pattern|structure|organize)\b/i,
    // Code terminology
    /\b(function|class|component|interface|type|const|let|var|import|export)\b/i,
    // Generic improvement requests without explicit current-event keywords
    /^(enhance|improve|refactor|optimize|can you|could you|please)\b/i,
  ];

  // Check exclusions first
  for (const pattern of exclusionPatterns) {
    if (pattern.test(normalizedQuery)) {
      return {
        requiresSearch: false,
        confidence: 'low',
        complexity: 'low',
        reason: 'Code/design query - search not needed',
      };
    }
  }

  const highConfidencePatterns = [
    /\b(today|latest|current|now|recent|breaking|live)\b/i,
    /\b(what is|who is|when did|where is|how much)\b.*\b(today|now|currently)\b/i,
    /\b(stock price|weather|news|score|election|result|standings|game|match|tournament)\b/i,
    /\b(as of|updated|real-time|right now)\b/i,
    /\b(sports?|nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey)\b.*\b(score|result|game|match|schedule|standings)\b/i,
    /\b(who (won|lost|is (winning|losing|playing)))\b/i,
  ];

  const mediumConfidencePatterns = [
    /\b(search for|find|look up|tell me about)\b/i,
    /\b(what happened|what's new|update on)\b/i,
    /\b(research|statistics|data on|facts about)\b/i,
    /\?(.*)(current|latest|today|now)/i,
  ];

  // Determine complexity for high-confidence patterns
  const complexityIndicators = /\b(research|analyze|compare|comprehensive|detailed|in-depth)\b/i;
  const complexity: 'high' | 'low' = complexityIndicators.test(normalizedQuery) ? 'high' : 'low';

  for (const pattern of highConfidencePatterns) {
    if (pattern.test(normalizedQuery)) {
      return {
        requiresSearch: true,
        confidence: 'high',
        complexity,
        reason: 'Time-sensitive or factual query detected',
      };
    }
  }

  for (const pattern of mediumConfidencePatterns) {
    if (pattern.test(normalizedQuery)) {
      return {
        requiresSearch: true,
        confidence: 'medium',
        complexity,
        reason: 'Informational query detected',
      };
    }
  }

  if (normalizedQuery.includes('?') && normalizedQuery.length < 100) {
    return {
      requiresSearch: false,
      confidence: 'low',
      complexity: 'low',
      reason: 'Simple question - may not need search',
    };
  }

  return {
    requiresSearch: false,
    confidence: 'low',
    complexity: 'low',
    reason: 'No search indicators detected',
  };
}

let searchServiceInstance: SearchService | null = null;

export function getSearchService(accessToken?: string): SearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new SearchService(accessToken);
  } else if (accessToken) {
    searchServiceInstance.setAccessToken(accessToken);
  }
  return searchServiceInstance;
}
