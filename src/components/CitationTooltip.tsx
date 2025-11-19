import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';

interface CitationTooltipProps {
  citationNumber: number;
  title: string;
  url: string;
  snippet?: string;
  children: React.ReactNode;
}

export const CitationTooltip: React.FC<CitationTooltipProps> = ({
  citationNumber,
  title,
  url,
  snippet,
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current.offsetHeight;
      const spaceAbove = triggerRect.top;
      const spaceBelow = window.innerHeight - triggerRect.bottom;

      if (spaceAbove > tooltipHeight + 10 || spaceAbove > spaceBelow) {
        setPosition('top');
      } else {
        setPosition('bottom');
      }
    }
  }, [isVisible]);

  const extractDomain = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'source';
    }
  };

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        className="citation-trigger inline-flex items-center cursor-pointer"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      >
        <sup className="text-blue-400 hover:text-blue-300 transition-colors font-medium px-0.5">
          [{citationNumber}]
        </sup>
      </span>

      {isVisible && (
        <div
          ref={tooltipRef}
          className={`
            citation-tooltip absolute z-50 w-80 max-w-[90vw]
            ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
            left-1/2 -translate-x-1/2
            bg-[#1c1c1e] border border-white/[0.1] rounded-xl shadow-2xl
            animate-in fade-in duration-150
          `}
          style={{
            boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Arrow */}
          <div
            className={`
              absolute left-1/2 -translate-x-1/2 w-3 h-3
              ${position === 'top' ? '-bottom-1.5' : '-top-1.5'}
              bg-[#1c1c1e] border-white/[0.1]
              ${position === 'top' ? 'border-b border-r' : 'border-t border-l'}
              rotate-45
            `}
          />

          {/* Content */}
          <div className="relative p-4">
            {/* Header */}
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white/90 line-clamp-2 leading-snug">
                  {title}
                </h4>
                <p className="text-xs text-white/50 mt-1 truncate">
                  {extractDomain(url)}
                </p>
              </div>
              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-blue-500/10">
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              </div>
            </div>

            {/* Snippet */}
            {snippet && (
              <p className="text-xs text-white/60 leading-relaxed line-clamp-3 mb-2">
                {snippet}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
              <span className="text-xs text-white/40">
                Citation {citationNumber}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
              >
                Open source →
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
};

interface CitationLinkProps {
  href: string;
  children: React.ReactNode;
  citations?: Array<{ url: string; title: string; snippet?: string }>;
}

export const CitationLink: React.FC<CitationLinkProps> = ({
  href,
  children,
  citations = [],
}) => {
  const citationMatch = href.match(/^#citation-(\d+)$/);

  if (!citationMatch) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline transition-colors"
      >
        {children}
      </a>
    );
  }

  const citationNumber = parseInt(citationMatch[1], 10);
  const citation = citations[citationNumber - 1];

  if (!citation) {
    return (
      <sup className="text-blue-400 font-medium px-0.5">
        [{citationNumber}]
      </sup>
    );
  }

  return (
    <CitationTooltip
      citationNumber={citationNumber}
      title={citation.title}
      url={citation.url}
      snippet={citation.snippet}
    >
      {children}
    </CitationTooltip>
  );
};
