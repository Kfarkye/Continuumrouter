import React, { useState, useRef } from 'react';
import { MoreHorizontal, Copy, Code2, RefreshCcw, ThumbsUp, ThumbsDown, Edit2, Check } from 'lucide-react';
import { ChatMessage } from '../types';
import { AnimatePresence, motion } from 'framer-motion';

interface MessageActionsProps {
  message: ChatMessage;
  onCopy: () => void;
  onCopyAllCode?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onRate?: (rating: 'good' | 'bad') => void;
  hasCodeBlocks?: boolean;
  disabled?: boolean;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  onCopy,
  onCopyAllCode,
  onRegenerate,
  onEdit,
  onRate,
  hasCodeBlocks = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRate = (rating: 'good' | 'bad') => {
    if (onRate) {
      onRate(rating);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="
          p-1.5 rounded-lg
          text-gray-400 hover:text-white hover:bg-white/5
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none
        "
        aria-label="Message actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* Dropdown Menu */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="
                absolute right-0 top-full mt-1 z-50
                w-56 py-1
                bg-zinc-900 border border-white/10 rounded-xl
                shadow-2xl shadow-black/50
                backdrop-blur-xl
              "
              role="menu"
              aria-orientation="vertical"
            >
              {/* Copy Action */}
              <button
                onClick={handleCopy}
                className="
                  w-full px-3 py-2 flex items-center gap-3
                  text-sm text-gray-300 hover:text-white hover:bg-white/5
                  transition-colors duration-150
                "
                role="menuitem"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy {isUser ? 'message' : 'reply'}</span>
                  </>
                )}
              </button>

              {/* Copy All Code (Assistant only) */}
              {isAssistant && hasCodeBlocks && onCopyAllCode && (
                <button
                  onClick={() => {
                    onCopyAllCode();
                    setIsOpen(false);
                  }}
                  className="
                    w-full px-3 py-2 flex items-center gap-3
                    text-sm text-gray-300 hover:text-white hover:bg-white/5
                    transition-colors duration-150
                  "
                  role="menuitem"
                >
                  <Code2 className="w-4 h-4" />
                  <span>Copy all code</span>
                </button>
              )}

              {/* Regenerate (Assistant only) */}
              {isAssistant && onRegenerate && (
                <>
                  <div className="h-px bg-white/5 my-1" role="separator" />
                  <button
                    onClick={() => {
                      onRegenerate();
                      setIsOpen(false);
                    }}
                    className="
                      w-full px-3 py-2 flex items-center gap-3
                      text-sm text-gray-300 hover:text-white hover:bg-white/5
                      transition-colors duration-150
                    "
                    role="menuitem"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    <span>Regenerate</span>
                  </button>
                </>
              )}

              {/* Edit (User only) */}
              {isUser && onEdit && (
                <>
                  <div className="h-px bg-white/5 my-1" role="separator" />
                  <button
                    onClick={() => {
                      onEdit();
                      setIsOpen(false);
                    }}
                    className="
                      w-full px-3 py-2 flex items-center gap-3
                      text-sm text-gray-300 hover:text-white hover:bg-white/5
                      transition-colors duration-150
                    "
                    role="menuitem"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit prompt</span>
                  </button>
                </>
              )}

              {/* Rating (Assistant only) */}
              {isAssistant && onRate && (
                <>
                  <div className="h-px bg-white/5 my-1" role="separator" />
                  <div className="px-3 py-1.5 text-xs text-gray-500 font-medium">
                    Rate this response
                  </div>
                  <div className="flex gap-1 px-2 pb-1">
                    <button
                      onClick={() => handleRate('good')}
                      className={`
                        flex-1 px-3 py-2 flex items-center justify-center gap-2
                        text-sm rounded-lg transition-all duration-150
                        ${message.rating === 'good'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'text-gray-400 hover:text-green-400 hover:bg-green-500/10 border border-white/5'
                        }
                      `}
                      role="menuitem"
                      aria-label="Rate as good"
                    >
                      <ThumbsUp className="w-4 h-4" />
                      <span className="text-xs">Good</span>
                    </button>
                    <button
                      onClick={() => handleRate('bad')}
                      className={`
                        flex-1 px-3 py-2 flex items-center justify-center gap-2
                        text-sm rounded-lg transition-all duration-150
                        ${message.rating === 'bad'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-white/5'
                        }
                      `}
                      role="menuitem"
                      aria-label="Rate as bad"
                    >
                      <ThumbsDown className="w-4 h-4" />
                      <span className="text-xs">Bad</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
