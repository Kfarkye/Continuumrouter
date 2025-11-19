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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 429) {
          throw new Error(`Quota exceeded: ${errorData.message || 'Search limit reached'}`);
        }

        if (response.status === 503) {
          throw new Error('Search service is currently unavailable');
        }

        throw new Error(errorData.error || `Search failed: ${response.statusText}`);
      }

      options?.onProgress?.('Processing results...');

      const data: PerplexitySearchResponse = await response.json();

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

  const highConfidencePatterns = [
    /\b(today|latest|current|now|recent|breaking|live)\b/i,
    /\b(what is|who is|when did|where is|how much)\b.*\b(today|now|currently)\b/i,
    /\b(stock price|weather|news|score|election|result)\b/i,
    /\b(as of|updated|real-time|right now)\b/i,
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
