import React, { useState } from 'react';
import { Citation } from '../types';
import { ExternalLink, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface CitationsFooterProps {
  citations: Citation[];
}

export const CitationsFooter: React.FC<CitationsFooterProps> = ({ citations }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="
          w-full flex items-center justify-between
          px-3 py-2 rounded-lg
          text-sm text-gray-400 hover:text-white hover:bg-white/5
          transition-colors duration-150
        "
      >
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          <span className="font-medium">
            {citations.length} source{citations.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {citations.map((citation) => (
                <div
                  key={citation.id}
                  onMouseEnter={() => setHoveredCitation(citation.id)}
                  onMouseLeave={() => setHoveredCitation(null)}
                  className="
                    relative p-3 rounded-lg
                    bg-white/5 border border-white/10
                    hover:bg-white/10 hover:border-white/20
                    transition-all duration-150
                  "
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white mb-1 truncate">
                        {citation.title}
                      </h4>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                        {citation.excerpt}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {citation.confidence !== undefined && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            {Math.round(citation.confidence * 100)}% confidence
                          </span>
                        )}
                        <span>
                          {new Date(citation.accessed_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {citation.url && (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          flex-shrink-0 p-2 rounded-lg
                          text-gray-400 hover:text-blue-400 hover:bg-blue-500/10
                          transition-colors duration-150
                        "
                        title="Open source"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* Hover Preview */}
                  <AnimatePresence>
                    {hoveredCitation === citation.id && citation.excerpt.length > 100 && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="
                          absolute z-10 left-0 right-0 top-full mt-2
                          p-3 rounded-lg
                          bg-zinc-900 border border-white/20
                          shadow-2xl shadow-black/50
                        "
                      >
                        <p className="text-xs text-gray-300 leading-relaxed">
                          {citation.excerpt}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
