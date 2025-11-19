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
        transition={{ duration: 0.2 }}
        className="bg-gradient-to-r from-blue-950/40 to-purple-950/40 border-b border-blue-500/20 backdrop-blur-sm sticky top-0 z-10 overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-start gap-3">
            {syncing && (
              <div className="p-1.5 bg-blue-500/20 rounded-lg">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-blue-200">Global Context Active</span>
                {syncing && (
                  <span className="text-xs text-blue-400/70 animate-pulse">Syncing...</span>
                )}
              </div>

              <div className="text-sm text-blue-300/80">
                {expanded ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="whitespace-pre-wrap font-mono text-xs bg-black/20 rounded-lg p-3 mt-2 max-h-60 overflow-y-auto"
                  >
                    {content}
                  </motion.div>
                ) : (
                  <p className="line-clamp-1">{previewContent}</p>
                )}
              </div>

              <div className="flex items-center gap-3 mt-2 text-xs text-blue-400/60">
                <span>{characterCount.toLocaleString()} characters</span>
                <span>•</span>
                <span>~{tokenEstimate.toLocaleString()} tokens</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {canExpand && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={expanded ? 'Collapse context' : 'Expand context'}
                  aria-expanded={expanded}
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? (
                    <ChevronUp className="w-4 h-4 text-blue-300" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-blue-300" />
                  )}
                </button>
              )}

              <button
                onClick={onEdit}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Edit context"
                title="Edit"
              >
                <Edit3 className="w-4 h-4 text-blue-300" />
              </button>

              <button
                onClick={handleToggleOff}
                disabled={toggling || syncing}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Disable context"
                title="Disable"
              >
                {toggling ? (
                  <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
                ) : (
                  <X className="w-4 h-4 text-blue-300" />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
