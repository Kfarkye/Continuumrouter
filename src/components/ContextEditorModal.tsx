import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Save, Loader2, AlertCircle, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { estimateTokens, validateTokenLimit } from '../services/contextService';
import { useDebounce } from 'use-debounce';

interface ContextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextContent: string;
  isActive: boolean;
  onSave: (content: string, isActive: boolean) => Promise<void>;
  currentModel?: string;
}

const EXAMPLE_CONTEXTS = [
  {
    role: 'Backend Developer',
    context: 'You are a senior backend developer specializing in Node.js, TypeScript, and microservices architecture. Focus on clean code, SOLID principles, and scalable solutions.',
  },
  {
    role: 'Frontend Developer',
    context: 'You are an expert frontend developer with deep knowledge of React, TypeScript, and modern CSS. Prioritize accessibility, performance, and user experience in all solutions.',
  },
  {
    role: 'DevOps Engineer',
    context: 'You are a DevOps engineer with expertise in Docker, Kubernetes, CI/CD pipelines, and cloud infrastructure. Focus on automation, reliability, and security best practices.',
  },
  {
    role: 'Data Scientist',
    context: 'You are a data scientist skilled in Python, machine learning, and statistical analysis. Emphasize data-driven insights, model interpretability, and reproducible research.',
  },
];

const MAX_CHAR_LIMIT = 15000;
const DEBOUNCE_TIME = 300;
const TOKEN_SAVE_LIMIT_PERCENT = 60;

export const ContextEditorModal: React.FC<ContextEditorModalProps> = ({
  isOpen,
  onClose,
  contextContent,
  isActive,
  onSave,
  currentModel = 'gpt-4',
}) => {
  const [content, setContent] = useState(contextContent);
  const [active, setActive] = useState(isActive);
  const [saving, setSaving] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [isCalculatingTokens, setIsCalculatingTokens] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [debouncedContent] = useDebounce(content, DEBOUNCE_TIME);

  const charCount = content.length;
  const charPercentage = (charCount / MAX_CHAR_LIMIT) * 100;

  const [tokenEstimate, setTokenEstimate] = useState(0);
  const [tokenPercentage, setTokenPercentage] = useState(0);

  useEffect(() => {
    setContent(contextContent);
    setActive(isActive);
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [contextContent, isActive, isOpen]);

  useEffect(() => {
    if (!debouncedContent) {
      setTokenEstimate(0);
      setTokenPercentage(0);
      setIsCalculatingTokens(false);
      return;
    }

    let mounted = true;
    setIsCalculatingTokens(true);

    async function calculateTokens() {
      try {
        const tokens = await estimateTokens(debouncedContent, currentModel);
        const validation = await validateTokenLimit(debouncedContent, '', currentModel);

        if (mounted) {
          setTokenEstimate(tokens);
          const percentage = (tokens / validation.maxTokens) * 100;
          setTokenPercentage(percentage);
        }
      } catch (error) {
        console.error('Error calculating tokens:', error);
        if (mounted) {
          toast.error('Could not estimate tokens. Using character count as a rough guide.', { id: 'token-estimation-error' });
          const fallbackTokens = Math.ceil(debouncedContent.length / 4);
          setTokenEstimate(fallbackTokens);
          setTokenPercentage((fallbackTokens / 8192) * 100);
        }
      } finally {
        if (mounted) {
          setIsCalculatingTokens(false);
        }
      }
    }

    calculateTokens();

    return () => {
      mounted = false;
    };
  }, [debouncedContent, currentModel]);

  const tokenWarning = useMemo(() => {
    if (tokenPercentage > TOKEN_SAVE_LIMIT_PERCENT) {
      return {
        level: 'error',
        message: `Context exceeds ${TOKEN_SAVE_LIMIT_PERCENT}% of the limit. It must be shortened before saving to leave room for conversation.`,
      };
    }
    if (tokenPercentage > 50) {
      return {
        level: 'warning',
        message: 'Context is very large. This may limit the length of conversation responses.',
      };
    } else if (tokenPercentage > 30) {
      return {
        level: 'info',
        message: 'Context size is substantial. Monitor usage during long conversations.',
      };
    }
    return null;
  }, [tokenPercentage]);

  const handleSave = useCallback(async () => {
    if (content.length > MAX_CHAR_LIMIT) {
      toast.error(`Context is too long. Maximum ${MAX_CHAR_LIMIT} characters allowed.`);
      return;
    }

    if (tokenPercentage > TOKEN_SAVE_LIMIT_PERCENT) {
      toast.error(`Context exceeds the save limit (${TOKEN_SAVE_LIMIT_PERCENT}%). Please shorten it.`);
      return;
    }

    setSaving(true);
    try {
      await onSave(content, active);
      toast.success('Context saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving context:', error);
      toast.error('Failed to save context. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [content, active, onSave, onClose, tokenPercentage]);

  const handleExampleClick = useCallback((exampleContext: string) => {
    setContent(exampleContext);
    setShowExamples(false);
    toast.success('Example loaded! Feel free to customize it.');
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    },
    [handleSave, onClose, saving]
  );

  if (!isOpen) return null;

  const isSaveDisabled = saving || charCount > MAX_CHAR_LIMIT || tokenPercentage > TOKEN_SAVE_LIMIT_PERCENT || isCalculatingTokens;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="context-editor-title"
    >
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/80 backdrop-blur-lg sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h2 id="context-editor-title" className="text-xl font-semibold text-white">Global Context</h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200 space-y-1">
              <p className="font-medium">What is Global Context?</p>
              <p className="text-blue-300/80">
                Global context is automatically prepended to every message you send. Use it to set your
                role, preferences, or guidelines that should apply to all conversations.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="context-content-textarea" className="text-sm font-medium text-gray-300">Context Content</label>
              <button
                onClick={() => setShowExamples(!showExamples)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {showExamples ? 'Hide' : 'Show'} Examples
              </button>
            </div>

            {showExamples && (
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_CONTEXTS.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(example.context)}
                    className="text-left p-3 bg-zinc-800 hover:bg-zinc-750 border border-white/5 hover:border-blue-500/30 rounded-lg transition-all"
                  >
                    <div className="text-sm font-medium text-white mb-1">{example.role}</div>
                    <div className="text-xs text-gray-400 line-clamp-2">{example.context}</div>
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              id="context-content-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g., You are a senior software engineer with expertise in..."
              className="w-full h-48 px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
              maxLength={MAX_CHAR_LIMIT}
              aria-describedby="context-usage-stats context-warning"
            />

            <div id="context-usage-stats" className="mt-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <span
                  className={`font-medium ${
                    charPercentage > 90
                      ? 'text-red-400'
                      : charPercentage > 70
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}
                >
                  {charCount.toLocaleString()} / {MAX_CHAR_LIMIT.toLocaleString()} characters
                </span>
                <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${
                        tokenPercentage > TOKEN_SAVE_LIMIT_PERCENT
                          ? 'text-red-400'
                          : tokenPercentage > 50
                          ? 'text-yellow-400'
                          : tokenPercentage > 30
                          ? 'text-blue-400'
                          : 'text-gray-400'
                      }`}
                    >
                      ~{tokenEstimate.toLocaleString()} tokens {tokenPercentage > 0 && `(${tokenPercentage.toFixed(1)}%)`}
                    </span>
                    {isCalculatingTokens && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
                </div>
              </div>
              <span className="text-gray-500">Model: {currentModel}</span>
            </div>

            {tokenWarning && (
              <div
                id="context-warning"
                className={`mt-3 flex items-start gap-2 p-3 rounded-lg ${
                  tokenWarning.level === 'error'
                    ? 'bg-red-950/30 border border-red-500/30 text-red-200'
                    : tokenWarning.level === 'warning'
                    ? 'bg-yellow-950/30 border border-yellow-500/30 text-yellow-200'
                    : 'bg-blue-950/30 border border-blue-500/30 text-blue-200'
                }`}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="text-xs">{tokenWarning.message}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-xl border border-white/5">
            <div>
              <div className="text-sm font-medium text-white mb-1">Enable Context</div>
              <div className="text-xs text-gray-400">
                Automatically prepend this context to all your messages
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
                aria-label="Enable Global Context Toggle"
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-zinc-900/80 backdrop-blur-lg gap-3 sticky bottom-0 z-10">
          <div className="text-xs text-gray-400">
            Press{' '}
            <kbd className="px-2 py-1 bg-zinc-800 border border-white/10 rounded text-xs">
              Ctrl+S
            </kbd>{' '}
            (or Cmd+S) to save
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaveDisabled}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Context
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
