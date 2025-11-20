import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Edit3, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface ContextBannerProps {
  content: string;
  characterCount: number;
  tokenEstimate: number;
  onEdit: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
  syncing?: boolean;
}

const PREVIEW_THRESHOLD = 120;

export const ContextBanner: React.FC<ContextBannerProps> = ({
  content,
  characterCount,
  tokenEstimate,
  onEdit,
  onToggle,
  syncing = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggleOff = useCallback(async () => {
    setToggling(true);
    try {
      await onToggle(false);
      toast.success('Global Context disabled.');
    } catch (error) {
      console.error("Failed to disable context:", error);
      toast.error('Failed to disable context. Please try again.');
      setToggling(false);
    }
  }, [onToggle]);

  const previewContent = useMemo(() => {
    return content.length > PREVIEW_THRESHOLD ? `${content.substring(0, PREVIEW_THRESHOLD)}...` : content;
  }, [content]);

  const canExpand = content.length > PREVIEW_THRESHOLD;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} // Apple ease
        className="sticky top-0 z-10 overflow-hidden"
        role="status"
        aria-live="polite"
      >
        {/* Glass Panel with Accent Border */}
        <div className="mx-4 mt-2">
          <div className="max-w-5xl mx-auto bg-zinc-900/80 backdrop-blur-xl border border-blue-500/20 border-l-4 border-l-blue-500 rounded-lg shadow-glass-sm">
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                {syncing && (
                  <div className="p-1.5 bg-blue-500/10 rounded-md">
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Global Context Active</span>
                    {syncing && (
                      <span className="text-[10px] text-blue-400/60 animate-pulse font-medium">Syncing...</span>
                    )}
                  </div>

                  <div className="text-sm text-zinc-300/90 leading-relaxed">
                    {expanded ? (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="whitespace-pre-wrap font-mono text-xs bg-black/30 rounded-md p-3 mt-2 max-h-60 overflow-y-auto border border-white/5 scrollbar-thin scrollbar-thumb-white/10"
                      >
                        {content}
                      </motion.div>
                    ) : (
                      <p className="line-clamp-1 font-light">{previewContent}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[10px] font-medium text-zinc-500">
                    <span>{characterCount.toLocaleString()} characters</span>
                    <span className="w-0.5 h-0.5 bg-zinc-600 rounded-full" />
                    <span>~{tokenEstimate.toLocaleString()} tokens</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {canExpand && (
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="p-1.5 hover:bg-white/5 hover:text-white text-zinc-400 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                      aria-label={expanded ? 'Collapse context' : 'Expand context'}
                      aria-expanded={expanded}
                      title={expanded ? 'Collapse' : 'Expand'}
                    >
                      {expanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={onEdit}
                    className="p-1.5 hover:bg-white/5 hover:text-white text-zinc-400 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                    aria-label="Edit context"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleToggleOff}
                    disabled={toggling || syncing}
                    className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-zinc-400 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                    aria-label="Disable context"
                    title="Disable"
                  >
                    {toggling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
