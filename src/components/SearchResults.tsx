import React, { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import type { SearchResult, SearchMetadata } from '../types';

interface SearchResultsProps {
  results: SearchResult[];
  metadata?: SearchMetadata;
  className?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  metadata,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!results || results.length === 0) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  };

  return (
    <div className={`search-results-container ${className}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.03] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white/90">
            Web Sources
            {metadata?.cache_hit && (
              <span className="ml-2 text-xs text-white/50">(cached)</span>
            )}
          </span>
          <span className="text-xs text-white/50">
            {results.length} {results.length === 1 ? 'source' : 'sources'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {metadata && (
            <span className="text-xs text-white/40">
              {metadata.latency_ms}ms
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/50" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/50" />
          )}
        </div>
      </div>

      {/* Results Grid */}
      {isExpanded && (
        <div className="grid gap-2 p-3">
          {results.map((result) => (
            <a
              key={result.id}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
            >
              {/* Favicon */}
              <div className="flex-shrink-0 mt-0.5">
                {result.favicon_url ? (
                  <img
                    src={result.favicon_url}
                    alt=""
                    className="w-4 h-4 rounded-sm"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe className="w-4 h-4 text-white/30" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Title */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium text-white/90 group-hover:text-blue-400 transition-colors line-clamp-1">
                    {result.title}
                  </h4>
                  <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-blue-400 flex-shrink-0 mt-0.5 transition-colors" />
                </div>

                {/* Domain and Date */}
                <div className="flex items-center gap-2 text-xs text-white/50 mb-1">
                  <span className="truncate">{result.domain}</span>
                  {result.published_date && (
                    <>
                      <span>•</span>
                      <span>{formatDate(result.published_date)}</span>
                    </>
                  )}
                  <span>•</span>
                  <span className="text-white/40">#{result.rank}</span>
                </div>

                {/* Snippet */}
                {result.snippet && (
                  <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">
                    {result.snippet}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Footer Metadata */}
      {metadata && isExpanded && (
        <div className="px-4 py-2 bg-white/[0.01] border-t border-white/[0.05] flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-white/40">
            {metadata.data_freshness && (
              <span>
                Updated: {formatDate(metadata.data_freshness)}
              </span>
            )}
            {metadata.model_used && (
              <span>Model: {metadata.model_used}</span>
            )}
          </div>
          {metadata.total_cost_usd > 0 && (
            <span className="text-white/30">
              ${metadata.total_cost_usd.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
