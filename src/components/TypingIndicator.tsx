/**
 * TypingIndicator Component
 *
 * ChatGPT-style typing indicator matching your MessageBubble design
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Code2 } from 'lucide-react';
import { getModelConfig } from '../config/models';

interface TypingIndicatorProps {
  model?: string;
  message?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  model,
  message = 'Thinking...',
}) => {
  const modelConfig = model ? getModelConfig(model) : null;
  const ModelIcon = modelConfig?.icon || Code2;

  const dotVariants = {
    initial: { y: 0, opacity: 0.4 },
    animate: { y: -6, opacity: 1 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="group py-6"
      role="status"
      aria-live="polite"
      aria-label="AI is typing"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3">
          {/* Avatar matching MessageBubble style */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-800 text-white shadow-sm">
              <ModelIcon className="w-4 h-4" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm text-zinc-200">
                {modelConfig?.name || 'Assistant'}
              </span>
            </div>

            {/* Typing animation */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900/40 rounded-lg border border-white/5">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    variants={dotVariants}
                    initial="initial"
                    animate="animate"
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      repeatType: 'reverse',
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                    className="w-2 h-2 bg-zinc-500 rounded-full"
                  />
                ))}
              </div>

              {message && (
                <span className="text-xs text-zinc-500 animate-pulse">
                  {message}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Compact typing indicator for inline use
 */
export const CompactTypingIndicator: React.FC = () => {
  const dotVariants = {
    initial: { scale: 0.8, opacity: 0.4 },
    animate: { scale: 1.2, opacity: 1 },
  };

  return (
    <div className="flex items-center gap-1" role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          variants={dotVariants}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: 'reverse',
            delay: i * 0.15,
          }}
          className="w-1.5 h-1.5 bg-zinc-500 rounded-full"
        />
      ))}
    </div>
  );
};
