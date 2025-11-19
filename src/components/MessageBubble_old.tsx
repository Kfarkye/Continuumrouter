/**
 * Premium-Ready Message Component
 * Inspired by ChatGPT, Gemini, and Claude.
 * Features: Subtle Depth, Refined Spacing, Micro-Interactions, and Optimized Rendering.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Copy, Check, AlertTriangle, Code2, FileText, RefreshCcw, ThumbsUp, ThumbsDown, Edit2, User, MoreVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Components } from 'react-markdown';
import yaml from 'js-yaml';
import { motion, AnimatePresence } from 'framer-motion';

// Configuration and Utilities (Assuming these imports exist in your project structure)
import { ChatMessage } from '../types';
import { getModelConfig } from '../config/models';
import { cn, formatFileSize } from '../lib/utils';
import { PREVIEW_CONFIG, validatePreviewSize } from '../config/previewConfig';
import { detectSnippets, PreviewGroup, describePreviewGroup } from '../utils/htmlDetector';
import { combineHtml, calculatePreviewSize } from '../utils/htmlCombiner';

// Specialized Block Components
import { CodeBlock } from './CodeBlock';
import { HTMLPreview } from './HTMLPreview';
import { DiagramBlock } from './DiagramBlock';
import { ApiSpecViewer } from './ApiSpecViewer';

/* ───────────────────────── Constants & Types ───────────────────────── */

export interface MessageBubbleProps {
  message: ChatMessage;
  isLatest: boolean;
  isStreaming: boolean; // global streaming flag from parent
  onRegenerate?: () => void;
  onEdit?: () => void;
  onRate?: (rating: 'good' | 'bad') => void;
}

// Use a distinct token that is unlikely to appear in content
const STREAMING_CURSOR_TOKEN = '❙'; // Using a simple block character
const STREAMING_CURSOR_REGEX = /❙/g;

/* ───────────────────────── Utility Functions ───────────────────────── */

const extractCodeBlocks = (content: string): string[] => {
  const genericCodeBlockRegex = /```[\w#+-]*\n?([\s\S]*?)```/g;
  const matches = [...content.matchAll(genericCodeBlockRegex)];
  return matches.map((match) => match[1].trim());
};

/* ───────────────────────── Utility Components (Animations) ───────────────────────── */

/**
 * Streaming Cursor – Subtle, pulsating block cursor (Inspired by Claude/GPT).
 */
const StreamingCursor = React.memo(() => (
  <>
    <style>
      {`
        @keyframes cursor-pulse-premium {
          0% { opacity: 1; }
          50% { opacity: 0.1; }
          100% { opacity: 1; }
        }

        .cursor-premium {
          /* Uses steps for a distinct blink effect */
          animation: cursor-pulse-premium 1.2s steps(1, end) infinite;
          background-color: rgb(203 213 225); /* slate-300 */
        }

        @media (prefers-reduced-motion: reduce) {
          .cursor-premium {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}
    </style>
    <span
      className="inline-block w-[0.5em] h-[1.1em] ml-0.5 align-middle cursor-premium rounded-sm"
      aria-label="Generating content"
      role="presentation"
    />
  </>
));
StreamingCursor.displayName = 'StreamingCursor';

const StreamingOverlay = React.memo(() => (
  <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-zinc-800/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
    <StreamingCursor />
    <span className="text-xs text-zinc-300">Generating...</span>
  </div>
));
StreamingOverlay.displayName = 'StreamingOverlay';

/* ───────────────────────── Markdown Rendering Utilities ───────────────────────── */

// Optimized recursive function to process children for the cursor token
const processChildrenForCursor = (children: React.ReactNode): React.ReactNode => {
  return React.Children.map(children, (child, index) => {
    if (typeof child === 'string') {
      if (child.includes(STREAMING_CURSOR_TOKEN)) {
        const parts = child.split(STREAMING_CURSOR_TOKEN);
        return parts.map((part, partIndex) => (
          <React.Fragment key={`${index}-${partIndex}`}>
            {part}
            {partIndex < parts.length - 1 && <StreamingCursor />}
          </React.Fragment>
        ));
      }
      return child;
    }

    // Handle nested elements recursively
    if (React.isValidElement(child) && child.props.children) {
        return React.cloneElement(child, {
            // biome-ignore lint/suspicious/noExplicitAny: Dynamic children processing
            children: processChildrenForCursor((child.props as any).children),
        } as any);
    }
    return child;
  });
};

/**
 * Helper factory to ensure cursor processing occurs in key structural elements (p, li, headings).
 */
const createCursorAwareRenderer = <T extends keyof JSX.IntrinsicElements>(
    Element: T
  ): Components[T] => {
    // biome-ignore lint/suspicious/noExplicitAny: Necessary for dynamic JSX element rendering.
    const DynamicElement = Element as any;

    return ({ node, children, ...props }: React.ComponentPropsWithRef<T>) => {
      const processedChildren = processChildrenForCursor(children);
      return <DynamicElement {...props}>{processedChildren}</DynamicElement>;
    };
  };

// Ensure structural elements initiate the recursive cursor processing.
const baseCursorAwareRenderers: Components = {
    p: createCursorAwareRenderer('p'),
    li: createCursorAwareRenderer('li'),
    h1: createCursorAwareRenderer('h1'),
    h2: createCursorAwareRenderer('h2'),
    h3: createCursorAwareRenderer('h3'),
    h4: createCursorAwareRenderer('h4'),
    h5: createCursorAwareRenderer('h5'),
    h6: createCursorAwareRenderer('h6'),
    td: createCursorAwareRenderer('td'),
    th: createCursorAwareRenderer('th'),
    blockquote: createCursorAwareRenderer('blockquote'),
};

/* ───────────────────────── HTML Preview Wrapper (Styles Adjusted) ───────────────────────── */

interface HTMLPreviewWrapperProps {
  group: PreviewGroup;
}

const HTMLPreviewWrapper = React.memo(({ group }: HTMLPreviewWrapperProps) => {
  const sizeInBytes = useMemo(() => calculatePreviewSize(group), [group]);
  const sizeValidation = useMemo(() => validatePreviewSize(sizeInBytes), [sizeInBytes]);
  const combinedHtml = useMemo(() => combineHtml(group), [group]);

  const handleOpenInNewTab = useCallback(() => {
    try {
        const blob = new Blob([combinedHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          newWindow.onload = () => URL.revokeObjectURL(url);
          setTimeout(() => URL.revokeObjectURL(url), 15000);
        }
      } catch (error) {
        console.error('Error creating blob URL for preview:', error);
      }
  }, [combinedHtml]);

  if (!sizeValidation.isValid) {
    return (
      <div
        className="my-5 border border-red-500/40 rounded-lg overflow-hidden bg-red-900/20"
        role="alert"
      >
        <div className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-red-300 mb-1">Preview Too Large</h4>
            <p className="text-sm text-zinc-300 mb-3">{sizeValidation.message}</p>
            <button
              onClick={handleOpenInNewTab}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm rounded-md transition-colors"
            >
              Open in New Tab
            </button>
            <p className="text-xs text-zinc-500 mt-2">
              Contains: {describePreviewGroup(group)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-5">
      {sizeValidation.shouldWarn && (
        <div
          className="mb-3 px-3 py-2 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-start gap-2"
          role="status"
        >
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-200">{sizeValidation.message}</p>
        </div>
      )}
      <HTMLPreview srcDoc={combinedHtml} title={describePreviewGroup(group)} />
    </div>
  );
});
HTMLPreviewWrapper.displayName = 'HTMLPreviewWrapper';

/* ───────────────────────── Error Boundary & SafeMarkdown ───────────────────────── */

class MarkdownErrorBoundary extends React.Component<
  { children: React.ReactNode; rawContent: string },
  { hasError: boolean; msg?: string }
> {
    state = { hasError: false, msg: undefined as string | undefined };

    static getDerivedStateFromError(err: unknown) {
      // biome-ignore lint/suspicious/noExplicitAny: Error boundaries require flexible typing.
      return { hasError: true, msg: String((err as any)?.message ?? err) };
    }

    componentDidCatch(err: unknown) {
        console.error('Markdown render error:', err);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-lg bg-red-900/30 p-4 border border-red-700/50 my-5" role="alert">
                   <div className="flex items-center gap-3 mb-3">
                       <AlertTriangle className="w-5 h-5 text-red-400" />
                       <p className="text-sm font-semibold text-red-300">
                           Rendering Failed: {this.state.msg}
                       </p>
                   </div>
                   <p className="text-xs text-white/70 mb-2">Displaying raw content as fallback:</p>
                   <CodeBlock
                        value={this.props.rawContent}
                        language="markdown"
                        wrap={true}
                        showLineNumbers={false}
                        isStreaming={false}
                    />
                </div>
            );
        }
        return this.props.children as React.ReactElement;
    }
}

interface SafeMarkdownProps extends React.ComponentProps<typeof ReactMarkdown> {
  content: string;
  sanitizedContent: string;
  components: Components;
}

const SafeMarkdown = React.memo(
  ({ content, sanitizedContent, components, ...rest }: SafeMarkdownProps) => {
    return (
      <MarkdownErrorBoundary rawContent={sanitizedContent}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} {...rest}>
          {content}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    );
  }
);
SafeMarkdown.displayName = 'SafeMarkdown';


/* ───────────────────────── Message Actions (Refactored Toolbar) ───────────────────────── */

interface MessageActionsProps {
    onCopy: () => void;
    onCopyAllCode?: () => void;
    onRegenerate?: () => void;
    onEdit?: () => void;
    onRate?: (rating: 'good' | 'bad') => void;
    hasCodeBlocks: boolean;
    isUser: boolean;
    isComplete: boolean;
    messageRating?: 'good' | 'bad' | null;
    className?: string;
  }

  // Reusable Action Button style
  const ActionButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { Icon: React.ElementType, label: string }> = ({ Icon, label, className: btnClass, ...props }) => (
    <button
        type="button"
        className={cn(
            "p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-700/70 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            btnClass
        )}
        aria-label={label}
        title={label}
        {...props}
    >
        <Icon className="w-4 h-4" />
    </button>
  );

  const MessageActions: React.FC<MessageActionsProps> = ({
    onCopy,
    onCopyAllCode,
    onRegenerate,
    onEdit,
    onRate,
    hasCodeBlocks,
    isUser,
    isComplete,
    messageRating,
    className,
  }) => {
    const [copied, setCopied] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);

    const handleCopy = useCallback(() => {
        onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [onCopy]);

    // Close dropdown on click outside (Robust handling)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showMore && moreRef.current && !moreRef.current.contains(event.target as Node)) {
                setShowMore(false);
            }
        };
        // Use capture phase for reliability
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [showMore]);

    if (!isComplete) return null;

    const hasOverflowActions = (!isUser && hasCodeBlocks && onCopyAllCode) || (!isUser && onRegenerate);

    return (
      <div className={cn("flex items-center gap-1 transition-opacity duration-200", className)}>

        {/* Primary Actions */}
        <ActionButton
            Icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy"}
            onClick={handleCopy}
            className={copied ? 'text-green-500 hover:text-green-500 !bg-transparent' : ''}
        />

        {isUser && onEdit && <ActionButton Icon={Edit2} label="Edit prompt" onClick={onEdit} />}

        {!isUser && onRate && (
            <>
                <ActionButton
                    Icon={ThumbsUp}
                    label="Good response"
                    onClick={() => onRate('good')}
                    className={messageRating === 'good' ? 'text-blue-400 hover:text-blue-400 !bg-transparent' : ''}
                />
                <ActionButton
                    Icon={ThumbsDown}
                    label="Bad response"
                    onClick={() => onRate('bad')}
                    className={messageRating === 'bad' ? 'text-red-400 hover:text-red-400 !bg-transparent' : ''}
                />
            </>
        )}

        {/* Secondary Actions (More menu) */}
        {hasOverflowActions && (
             <div className="relative" ref={moreRef}>
                <ActionButton Icon={MoreVertical} label="More options" onClick={() => setShowMore(p => !p)} aria-haspopup="menu" aria-expanded={showMore} />

                <AnimatePresence>
                    {showMore && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                            transition={{ duration: 0.1 }}
                            // Dropdown positioned above the button (bottom-full)
                            className="absolute left-0 bottom-full mb-2 z-50 w-48 py-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl backdrop-blur-md"
                            role="menu"
                        >
                            {/* Menu Items */}
                            {hasCodeBlocks && onCopyAllCode && (
                                <button
                                    onClick={() => { onCopyAllCode(); setShowMore(false); }}
                                    className="w-full px-3 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors duration-150"
                                    role="menuitem"
                                >
                                    <Code2 className="w-4 h-4" />
                                    <span>Copy all code</span>
                                </button>
                            )}
                             {onRegenerate && (
                                <button
                                    onClick={() => { onRegenerate(); setShowMore(false); }}
                                    className="w-full px-3 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors duration-150"
                                    role="menuitem"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    <span>Regenerate</span>
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        )}

      </div>
    );
  };


/* ───────────────────────── MessageBubble (Refactored for Premium Feel) ───────────────────────── */

export const MessageBubble = React.memo(function MessageBubble({
  message,
  isLatest,
  isStreaming: isParentStreaming,
  onRegenerate,
  onEdit,
  onRate,
}: MessageBubbleProps) {

  // Derived state
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isStreaming = message.status === 'streaming' && isParentStreaming;
  const isComplete = message.status === 'complete';

  const sanitizedContent = useMemo(() => {
    return message.content.replace(STREAMING_CURSOR_REGEX, '');
  }, [message.content]);

  // HTML/JS/CSS detection (Optimized)
  const detectedGroups = useMemo(() => {
    if (isUser) return [];
    // Simple optimization: don't run expensive detection on very short strings while streaming
    if (isStreaming && sanitizedContent.length < 100) return [];
    return detectSnippets(sanitizedContent);
  }, [sanitizedContent, isUser, isStreaming]);

  const previewGroups = useMemo(
    () => detectedGroups.slice(0, PREVIEW_CONFIG.MAX_PREVIEWS_PER_MESSAGE),
    [detectedGroups]
  );

  const hasExceededPreviewLimit =
    detectedGroups.length > PREVIEW_CONFIG.MAX_PREVIEWS_PER_MESSAGE;

  // Core Markdown Rendering Logic
  const markdownRenderers = useMemo((): Components => {
    let codeBlockIndex = -1;
    const renderers: Components = { ...baseCursorAwareRenderers };

    // 'p' renderer handles unwrapping (cursor processing is handled by baseCursorAwareRenderers)
    renderers.p = ({ node, children, ...props }) => {
        const childrenArray = React.Children.toArray(children);
        // 1. Unwrapping block-level components
        if (
          childrenArray.length === 1 &&
          React.isValidElement(childrenArray[0]) &&
          typeof childrenArray[0].props.className === 'string' &&
          childrenArray[0].props.className.includes('block-level-code-container')
        ) {
          return <>{childrenArray[0]}</>;
        }
        // 2. Render paragraph with cursor processing
        const processedChildren = processChildrenForCursor(children);
        return <p {...props}>{processedChildren}</p>;
      };

    renderers.a = ({ node, children, ...props }) => {
        // Cursor processing handled recursively
        const processedChildren = processChildrenForCursor(children);
        return (
          <a {...props} target="_blank" rel="noopener noreferrer">
            {processedChildren}
          </a>
        );
    };
    renderers.pre = ({ children }) => <>{children}</>;

    // Override 'code' for enhanced rendering
    renderers.code = ({ inline, className, children, ...props }) => {
      const rawText = React.Children.toArray(children).join('').replace(/\n$/, '');
      const match = /language-(\w+)/.exec(className || '');
      const language = (match?.[1] ?? '').toLowerCase();

      const hasStreamingCursor = rawText.includes(STREAMING_CURSOR_TOKEN);
      const cleanText = rawText.replace(STREAMING_CURSOR_REGEX, '');

      if (!inline) {
        codeBlockIndex++;
        const currentIndex = codeBlockIndex;

        // Handle Preview Groups
        const group = previewGroups.find((g) => g.indices.includes(currentIndex));
        if (group) {
          if (group.indices[0] === currentIndex) {
            return (
              <div className="block-level-code-container">
                <HTMLPreviewWrapper group={group} />
              </div>
            );
          }
          return null;
        }

        // Standalone HTML
        if (language === 'html') {
          return (
            // Added my-5 for consistent vertical spacing
            <div className="relative my-5 block-level-code-container">
              <div className="flex flex-col gap-4">
                <HTMLPreview srcDoc={cleanText} title="HTML Preview" />
                <CodeBlock
                  key={`html-${currentIndex}`}
                  value={cleanText}
                  language="html"
                  showLineNumbers
                  isStreaming={false}
                />
              </div>
              {hasStreamingCursor && <StreamingOverlay />}
            </div>
          );
        }

        // Mermaid
        if (language === 'mermaid') {
          return (
            <div className="block-level-code-container my-5">
              <DiagramBlock value={cleanText} />
            </div>
          );
        }

        // API Specs (Optimized parsing check)
        if (language === 'json' || language === 'yaml') {
          try {
            // biome-ignore lint/suspicious/noExplicitAny: Dynamic structure.
            let parsed: any;
            // Optimization: Check for keywords before expensive parsing
            if (language === 'json') {
              if (cleanText.trim().startsWith('{') && (cleanText.includes('"openapi"') || cleanText.includes('"swagger"'))) {
                parsed = JSON.parse(cleanText);
              }
            } else {
                if (cleanText.includes('openapi:') || cleanText.includes('swagger:')) {
                    parsed = yaml.load(cleanText);
                }
            }

            if (parsed && typeof parsed === 'object' && (parsed.openapi || parsed.swagger)) {
              return (
                <div className="block-level-code-container my-5">
                  <ApiSpecViewer spec={cleanText} format={language as 'json' | 'yaml'} />
                </div>
              );
            }
          } catch {
            // Fall through if parsing fails (e.g., during streaming)
          }
        }

        // Standard Code Block
        return (
          <div className="relative my-5 block-level-code-container">
            <CodeBlock
              key={`code-${currentIndex}`}
              value={cleanText}
              language={language || undefined}
              showLineNumbers={true}
              isStreaming={false}
            />
            {hasStreamingCursor && <StreamingOverlay />}
          </div>
        );
      }

      // Inline code
      if (hasStreamingCursor) {
        return (
          <span className="inline-flex items-center gap-0.5">
            <CodeBlock inline={true} value={cleanText} isStreaming={false} {...props} />
            <StreamingCursor />
          </span>
        );
      }
      return <CodeBlock inline={true} value={cleanText} isStreaming={false} {...props} />;
    };

    return renderers;
  }, [previewGroups]);

  const codeBlocks = useMemo(() => extractCodeBlocks(sanitizedContent), [sanitizedContent]);

  // Action Handlers
  const copyFullReply = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sanitizedContent);
    } catch (err) {
      console.error('Failed to copy reply:', err);
    }
  }, [sanitizedContent]);

  const copyAllCode = useCallback(async () => {
    const allCode = codeBlocks.join('\n\n// ---\n\n');
    if (!allCode) return;
    try {
      await navigator.clipboard.writeText(allCode);
      // Note: Feedback might require a toast system as this is triggered from a dropdown.
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, [codeBlocks]);

  const modelConfig = useMemo(
    () => getModelConfig(message.metadata?.provider),
    [message.metadata?.provider]
  );
  const ModelIcon = modelConfig?.icon;

  // Prepares the content for rendering
  const contentWithCursor = useMemo(() => {
    if (isStreaming && isAssistant) {
      // Ensure cursor is always at the very end and only added once
      const cleanContent = message.content.replace(STREAMING_CURSOR_REGEX, '');
      return cleanContent + STREAMING_CURSOR_TOKEN;
    }
    return sanitizedContent;
  }, [message.content, isStreaming, isAssistant, sanitizedContent]);


  // Avatar Component (Internal)
  const Avatar = useMemo(() => {
    return (
        <div className="flex-shrink-0 pt-0.5">
            <div
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm ring-1 ring-white/10",
                    // User style (using sky-600 from original userGlass)
                    isUser && "bg-sky-600",
                    // Assistant style (using model config or fallback)
                    !isUser && (modelConfig?.colorClass || "bg-zinc-700")
                )}
            >
                {/* Replace with actual user icon/image if available */}
                {isUser ? <User className='w-5 h-5'/> : (ModelIcon ? ModelIcon : <Code2 className='w-5 h-5'/>)}
            </div>
        </div>
    );
  }, [isUser, modelConfig, ModelIcon]);

  // Motion variants for subtle, springy entrance
  const messageVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: "spring",
            stiffness: 300,
            damping: 25,
            duration: 0.3
        }
    },
  };

  return (
    <motion.div
        // Apply animation only to the latest message on arrival. Use `false` to skip initial animation for existing messages.
        initial={isLatest ? "hidden" : false}
        animate="visible"
        variants={messageVariants}
        // Layout: Full width row with vertical rhythm. 'group' enables hover interactions.
        className={cn(
            "py-4 md:py-5 group",
            // Subtle depth layering: Assistant responses get a slight background differentiation
            isAssistant && "border-b border-zinc-800/80 bg-zinc-900/40"
        )}
        data-message-id={message.id}
        data-role={message.role}
    >
        {/* Centered Content Container (The "Lane") */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-5">

            {Avatar}

            <div className="flex-1 min-w-0">
                {/* Header (Name) */}
                <div className="mb-2 font-semibold text-base text-zinc-100">
                    {isUser ? 'You' : (modelConfig?.name || 'Assistant')}
                </div>

                {/* Body Content */}
                <div className="text-zinc-300 leading-7">
                    <SafeMarkdown
                        content={contentWithCursor}
                        sanitizedContent={sanitizedContent}
                        components={markdownRenderers}
                        // Refined Prose styles for a premium look and readability
                        className="prose prose-invert max-w-none
                                prose-p:mt-0 prose-p:mb-5
                                prose-headings:text-white prose-headings:font-semibold prose-headings:mb-4 prose-headings:mt-6
                                prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-a:transition-colors
                                prose-a:underline prose-a:decoration-blue-400/50 hover:prose-a:decoration-blue-300/70
                                prose-strong:text-white prose-strong:font-medium
                                prose-blockquote:border-l-zinc-600 prose-blockquote:text-zinc-400 prose-blockquote:pl-4 prose-blockquote:my-5
                                prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-li:marker:text-zinc-500
                                prose-table:my-5 prose-th:px-3 prose-th:py-2 prose-th:bg-zinc-800 prose-td:px-3 prose-td:py-2 prose-tr:border-b prose-tr:border-zinc-700"
                    />

                    {/* Attachments (Refined style) */}
                    {message.files && message.files.length > 0 && (
                        <div className="mt-4 mb-5 flex flex-wrap gap-3">
                            {message.files.map((file, idx) => (
                                <div
                                    key={file.id || idx}
                                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700/80 transition-colors duration-200 shadow-sm cursor-pointer"
                                >
                                    <FileText className="w-5 h-5 text-blue-400" />
                                    <div className='flex flex-col'>
                                        <span className="text-sm text-white truncate max-w-xs">
                                            {file.name}
                                        </span>
                                        <span className="text-xs text-zinc-500">
                                            {formatFileSize(file.size)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Warnings/Errors */}
                    {hasExceededPreviewLimit && (
                        <div
                            className="mt-2 mb-5 px-3 py-2 bg-yellow-900/30 border border-yellow-600/50 rounded-lg flex items-start gap-2"
                            role="status"
                        >
                            <AlertTriangle className="w-4 h-4 text-yellow-300 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-yellow-100">
                                {detectedGroups.length - PREVIEW_CONFIG.MAX_PREVIEWS_PER_MESSAGE} additional
                                preview(s) suppressed.
                            </p>
                        </div>
                    )}

                     {message.status === 'error' && (
                        <div className="mt-2 mb-5 px-4 py-3 bg-red-900/40 border border-red-500/60 rounded-lg flex items-center gap-3 text-red-300" role="alert">
                            <AlertTriangle className="w-5 h-5" />
                            <span className='text-sm'>An error occurred while generating the response.</span>
                        </div>
                    )}
                </div>

                {/* Actions Toolbar */}
                {isComplete && sanitizedContent.length > 0 && (
                    <MessageActions
                        onCopy={copyFullReply}
                        onCopyAllCode={copyAllCode}
                        onRegenerate={onRegenerate}
                        onEdit={onEdit}
                        onRate={onRate}
                        hasCodeBlocks={codeBlocks.length > 0}
                        isUser={isUser}
                        isComplete={isComplete}
                        messageRating={message.rating}
                        // Intelligent visibility: Always on for latest, otherwise fade in on hover
                        className={cn(
                            "mt-2",
                            isLatest ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                        )}
                    />
                )}

            </div>
        </div>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';