// src/components/MessageBubble.tsx
/**
 * MessageBlock Component (Production Grade - Vercel/Linear/ChatGPT Standard)
 *
 * A highly optimized, visually polished, and accessible chat message component.
 * This implementation adopts a full-width, contiguous flow layout, prioritizing typography,
 * readability, performance, and reliability.
 *
 * Design: Minimalist dark mode aesthetic.
 * Engineering: Optimized rendering, lazy loading, robust state management, A11y compliant.
 */

import React, { useState, memo, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { ChatMessage } from '../types'; // Assuming ChatMessage includes id, role, content, status, files, metadata.
// Optimized Lucide icons (Ensure bundler supports tree-shaking)
import { Edit2, Check, Copy, RefreshCcw, AlertTriangle, Monitor, User, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Components } from 'react-markdown';
import { HTMLPreview } from './HTMLPreview';
import { ImageGrid, ImageGridItem } from './images/ImageGrid';
import { SearchResults } from './SearchResults';
import { detectSnippets, PreviewGroup, describePreviewGroup } from '../utils/htmlDetector';
import { combineHtml } from '../utils/htmlCombiner';
import yaml from 'js-yaml';
import { Spinner } from './Spinner';

// --- Configuration & Optimization ---

// PERFORMANCE: Aggressive Code Splitting. Lazy loading heavy visualization components reduces initial JS payload.
const CodeBlock = lazy(() => import('./CodeBlock').then(m => ({ default: m.CodeBlock })));
const DiagramBlock = lazy(() => import('./DiagramBlock').then(m => ({ default: m.DiagramBlock })));
const ApiSpecViewer = lazy(() => import('./ApiSpecViewer').then(m => ({ default: m.ApiSpecViewer })));

// Lightweight fallback designed to minimize Cumulative Layout Shift (CLS).
const ComponentLoader = memo(() => (
  <div className="flex items-center justify-center py-8 bg-zinc-800/50 rounded-lg my-4 border border-zinc-800" role="status" aria-label="Loading content">
    <Spinner size="sm" />
    <span className="ml-3 text-sm text-zinc-400">Loading...</span>
  </div>
));
ComponentLoader.displayName = 'ComponentLoader';

// Renaming props interface to match the component name change (Bubble -> Block)
interface MessageBlockProps {
  message: ChatMessage;
  isLatest: boolean;
  // Global streaming state from the chat context
  isStreaming: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetry?: (messageId: string) => void;
  // Customization props for identity (required for this layout style).
  userAvatarUrl?: string;
  assistantAvatar?: React.ReactNode;
}

// --- Refined Sub-components & Helpers ---

// 1. Avatar Component (Visual anchoring and identity)
interface AvatarProps {
  role: 'user' | 'assistant' | 'system';
  imageUrl?: string;
  children?: React.ReactNode;
}

const Avatar = memo(({ role, imageUrl, children }: AvatarProps) => {
  const baseClasses = "flex items-center justify-center w-8 h-8 rounded-full shrink-0 shadow-sm";

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={`${role} avatar`}
        className={`${baseClasses} object-cover border border-white/10`}
        loading="lazy"
      />
    );
  }

  if (children) {
     // Custom ReactNode (e.g., branded logo)
    return <div className={`${baseClasses} bg-zinc-700 text-white`}>{children}</div>;
  }

  // Default fallbacks
  let content: React.ReactNode;
  let styleClasses = "";
  if (role === 'user') {
    content = <User className="w-4 h-4" />;
    styleClasses = "bg-blue-600 text-white";
  } else {
    // Default AI/Assistant
    content = <Cpu className="w-4 h-4" />;
    styleClasses = "bg-teal-600 text-white";
  }

  return (
    <div className={`${baseClasses} ${styleClasses}`}>
      {content}
    </div>
  );
});
Avatar.displayName = 'Avatar';

// 2. Refined Streaming Cursor: Inspired by iOS/VSCode terminal cursor (sharp, smooth pulse).
const StreamingCursor = React.memo(() => (
  <motion.span
    // Precisely scaled (1.1em height) and aligned (align-text-bottom) for typographic perfection.
    className="inline-block w-[2px] h-[1.1em] bg-zinc-100 ml-[2px] rounded-sm align-text-bottom"
    // A subtle, smooth "breathing" pulse.
    animate={{ opacity: [0.2, 1, 1, 0.2] }}
    transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
    aria-hidden="true"
  />
));
StreamingCursor.displayName = 'StreamingCursor';

// 3. Typing Indicator (Used during initial latency or tool execution)
const TypingIndicator = React.memo(() => (
  <div className="flex items-center gap-1.5 py-2" aria-label="Assistant is thinking...">
    <motion.span className="w-1.5 h-1.5 bg-zinc-400 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8 }} />
    <motion.span className="w-1.5 h-1.5 bg-zinc-400 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }} />
    <motion.span className="w-1.5 h-1.5 bg-zinc-400 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }} />
  </div>
));
TypingIndicator.displayName = 'TypingIndicator';

// 4. HTML Preview Wrapper (Production-grade sandboxing container)
interface HTMLPreviewWrapperProps {
  group: PreviewGroup;
}

const HTMLPreviewWrapper = React.memo(({ group }: HTMLPreviewWrapperProps) => {
  const combinedHtml = useMemo(() => {
    if (!group) return '';
    return combineHtml({
      html: group.html || '',
      css: group.css || '',
      js: group.js || ''
    });
  }, [group]);

  const title = useMemo(() => describePreviewGroup(group), [group]);
  const allowScripts = !!group.js;

  if (!combinedHtml) return null;

  // Refined styling: Integrated look matching Vercel/Linear component previews.
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      // Using my-6 for clear visual separation.
      className="my-6 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 shadow-xl"
    >
      {/* Header Bar: Minimalist and informative */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-800/50 text-xs font-medium text-zinc-400 border-b border-zinc-700">
        <Monitor className="w-3.5 h-3.5 text-blue-400" />
        <span>Live Preview: {title} {allowScripts && <span className="text-yellow-500 ml-2">(Interactive)</span>}</span>
      </div>
      {/* SECURITY NOTE: HTMLPreview MUST implement a securely sandboxed iframe, especially if scripts are allowed. */}
      <HTMLPreview srcDoc={combinedHtml} title={title} allowScripts={allowScripts} />
    </motion.div>
  );
});
HTMLPreviewWrapper.displayName = 'HTMLPreviewWrapper';

// 5. ActionButton Helper (Encapsulates micro-interactions, styling, and A11y)
interface ActionButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const ActionButton = memo(({ onClick, label, children, disabled = false, className = '' }: ActionButtonProps) => (
  <motion.button
    onClick={onClick}
    // Refined interaction: Crisp color change and subtle background highlight.
    // Accessibility: Clear focus ring (focus-visible) for keyboard navigation.
    className={`p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors duration-150 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
    aria-label={label}
    title={label}
    // Micro-interaction: A tactile "press" feedback.
    whileTap={{ scale: 0.92 }}
    disabled={disabled}
  >
    {children}
  </motion.button>
));
ActionButton.displayName = 'ActionButton';

// Helper function to process files into ImageGrid format robustly
const processImages = (files: ChatMessage['files']): ImageGridItem[] => {
    if (!files) return [];
    return files
        // Filter for valid image URLs and types
        .filter(file => file.url && (file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)))
        .map(file => ({
            url: file.url!,
            // Use optimized thumbnail if available, otherwise fallback to main URL
            thumbnail_url: file.thumbnail_url || file.url,
            filename: file.name,
            // Use actual dimensions if provided (crucial for preventing CLS), otherwise undefined.
            width: file.width || undefined,
            height: file.height || undefined,
        }));
  };

// --- Main MessageBlock Component ---
// PERFORMANCE: Memoized at the top level. Optimized for use in virtualized lists.

export const MessageBlock: React.FC<MessageBlockProps> = memo(({
  message,
  isLatest,
  isStreaming,
  onEditMessage,
  onRetry,
  userAvatarUrl,
  assistantAvatar
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  // Manages visibility of actions for hover interactions and keyboard accessibility.
  const [showActions, setShowActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Robustly synchronize editContent with message.content ONLY when not actively editing.
  // This prevents external updates (like streaming completion) from overwriting user input during an edit.
  useEffect(() => {
    if (!isEditing) {
        setEditContent(message.content);
    }
  }, [message.content, isEditing]);


  // --- State Definitions & Permissions ---
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isError = message.status === 'error';

  // Determines if this specific message instance is actively streaming content.
  const isMessageStreaming = isStreaming && isLatest && isAssistant && !isError;

  // Permissions define available user actions.
  const canEdit = isUser && !!onEditMessage && !isStreaming && !isError;
  // Retry is available for errors OR regenerating the latest assistant message.
  const canRetry = !!onRetry && !isStreaming && (isError || (isLatest && isAssistant));
  const canCopy = !!message.content && !isError && isAssistant;

  // Process images (Memoized)
  const images = useMemo(() => processImages(message.files), [message.files]);

  // --- Content Processing (HTML Previews) ---
  // PERFORMANCE: Memoized detection of snippets. Crucial optimization.
  const previewGroups = useMemo(() => {
    // Optimization: Skip processing if the message cannot contain previews.
    if (!isAssistant || !message.content || isError) return [];

    try {
      const groups = detectSnippets(message.content);
      // Filter out empty groups for robustness.
      return Array.isArray(groups) ? groups.filter(g => g && (g.html || g.css || g.js)) : [];
    } catch (error) {
      console.error(`Error detecting snippets in message ${message.id}:`, error);
      return [];
    }
  }, [message.content, message.id, isAssistant, isError]);

  // --- Effects for Edit Mode ---

  // EFFECT 1: Handle Focus and Cursor Position when starting to edit.
  // CRITICAL: This effect must ONLY depend on `isEditing`. Depending on `editContent` causes the cursor to jump on every keystroke.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
        const textarea = textareaRef.current;
        textarea.focus();
        // Move cursor to the end of the text
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }
  }, [isEditing]);

  // EFFECT 2: Handle Auto-resizing of the textarea.
  // This effect depends on `isEditing` and `editContent` (to resize as the user types).
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;

      // Critical step: Reset height to 'auto' before calculating scrollHeight to allow shrinking.
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;

      // Apply new height, constrained to 60vh max height.
      // NOTE: Ensure global CSS or Tailwind config enables `transition-height` for smoothness.
      const maxHeight = window.innerHeight * 0.6;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [isEditing, editContent]);

  // --- Handlers ---
  const handleStartEdit = useCallback(() => {
    if (canEdit) {
      // Content is synchronized by the useEffect hook.
      setIsEditing(true);
      setShowActions(false);
    }
  }, [canEdit]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    // Resetting content is handled by the synchronization useEffect hook.
  }, []);

  const handleSaveEdit = useCallback(() => {
    const trimmedContent = editContent.trim();
    if (trimmedContent && trimmedContent !== message.content) {
      onEditMessage?.(message.id, trimmedContent);
    }
    setIsEditing(false);
  }, [editContent, message.id, message.content, onEditMessage]);

  const handleRetry = useCallback(() => {
    if (canRetry) {
      onRetry?.(message.id);
    }
  }, [canRetry, onRetry, message.id]);

  // Keyboard shortcuts for editing (Enter=save, Escape=cancel).
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const handleCopyMessage = useCallback(() => {
    if (!canCopy || !message.content) return;

    // Use modern async clipboard API (requires HTTPS/secure context).
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(message.content).then(() => {
        setCopied(true);
        // Quick reset for immediate feedback loop (1500ms).
        setTimeout(() => setCopied(false), 1500);
      }).catch(err => {
        console.error('Failed to copy message content: ', err);
        // Future enhancement: Implement error toast notification here.
      });
    }
  }, [message.content, canCopy]);

  // --- Markdown Configuration ---
  // PERFORMANCE: Memoized configuration object for ReactMarkdown. Critical for performance.
  const markdownComponents: Components = useMemo(() => ({
    // Complex Code Block Renderer (Handles specialized formats, standard code, and preview integration)
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1].toLowerCase() : '';
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && language) {
        // 1. Specialized Visualization: Mermaid Diagrams
        if (language === 'mermaid') {
          return (
            <Suspense fallback={<ComponentLoader />}>
              <DiagramBlock code={codeString} />
            </Suspense>
          );
        }

        // 2. Specialized Visualization: OpenAPI/Swagger (YAML or JSON)
        // Heuristic check for performance: only attempt parsing if keywords are present.
        if (codeString.includes('openapi:') || codeString.includes('swagger:')) {
             if (language === 'yaml' || language === 'yml' || language === 'json') {
                try {
                    // Use js-yaml to robustly parse both YAML (superset) and JSON.
                    const spec = yaml.load(codeString);
                    // Validate structure before loading the heavy visualization component.
                    if (typeof spec === 'object' && spec !== null && ((spec as any).openapi || (spec as any).swagger)) {
                    return (
                        <Suspense fallback={<ComponentLoader />}>
                        <ApiSpecViewer spec={spec as any} />
                        </Suspense>
                    );
                    }
                } catch (e) {
                    // If parsing fails, fall through to standard code block rendering.
                    console.warn("Failed to parse potential OpenAPI spec, rendering as code.", e);
                }
            }
        }

        // 3. Integration with HTML PreviewGroup: Hide code blocks already rendered as a live preview.
        const isInPreviewGroup = previewGroups.some(group =>
           // Use exact matching and language verification for robustness
          (group.html === codeString && language === 'html') ||
          (group.css === codeString && language === 'css') ||
          (group.js === codeString && (language === 'javascript' || language === 'js'))
        );

        if (isInPreviewGroup) {
          return null;
        }

        // 4. Standard Code Block (Syntax Highlighting)
        return (
          <Suspense fallback={<ComponentLoader />}>
            <CodeBlock
              language={language}
              value={codeString}
              // Pass streaming state down for potential optimizations within CodeBlock.
              isStreaming={isMessageStreaming}
              {...props}
            />
          </Suspense>
        );
      }

      // Inline code styling: Refined for high readability on dark backgrounds.
      return (
        <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-sm font-mono text-sky-300 border border-zinc-700/70" {...props}>
          {children}
        </code>
      );
    },

    // Security: Ensure all links open securely in a new tab.
    a: ({ node, children, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,

    // Table Styling: Customized for the dark theme, ensuring clean presentation of tabular data.
    table: ({ children, ...props }) => (
        <div className="overflow-x-auto my-6 rounded-lg border border-zinc-700 shadow-md bg-zinc-950">
            <table className="w-full text-left text-sm" {...props}>{children}</table>
        </div>
    ),
    th: ({ children, ...props }) => <th className="px-4 py-3 font-semibold text-zinc-200 bg-zinc-800 border-b border-zinc-700" {...props}>{children}</th>,
    td: ({ children, ...props }) => <td className="px-4 py-3 border-t border-zinc-800 text-zinc-300" {...props}>{children}</td>,
    // Hover effect for improved row tracking.
    tr: ({ children, ...props }) => <tr className="hover:bg-zinc-800/50 transition-colors duration-150" {...props}>{children}</tr>

  }), [previewGroups, isMessageStreaming]);

  // --- Styling & Layout Definitions ---

  // The layout uses a contiguous flow. Messages span the width, differentiated by subtle backgrounds and avatars.
  let containerClasses = 'group py-5 px-4 sm:px-6 transition-colors duration-300';

  // Subtle background differentiation (Assumes a very dark main background, e.g., zinc-950).
  if (isError) {
    // Distinct error state background
    containerClasses += ' bg-red-900/20 border-y border-red-800/30';
  } else if (isAssistant) {
    // Assistant messages have a slightly different tone and subtle borders for separation (ChatGPT style).
    containerClasses += ' bg-zinc-800/30 border-y border-zinc-800/50';
  } else {
    // User messages (transparent background)
    containerClasses += ' bg-transparent';
  }

  // Animation variants for message entry (subtle fade and vertical slide).
  const entryVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  };

  // --- Render Logic ---

  // 0. Render System Messages (e.g., context updates, tool usage indicators)
  if (message.role === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        // Full-width banner style for system updates
        className="flex justify-center w-full py-3 px-4 sm:px-6 bg-zinc-800/30 border-y border-zinc-800/50"
      >
        <div className="max-w-3xl w-full flex items-center gap-3 text-sm font-mono text-zinc-500">
            <span className='text-xs opacity-70'>SYSTEM:</span>
            <span className='truncate'>{message.content}</span>
        </div>
      </motion.div>
    );
  }

  // 1. Render Editing Interface
  if (isEditing) {
    return (
      <div className={containerClasses}>
        {/* Maintain layout consistency (avatars and width) during editing */}
        <div className="max-w-3xl mx-auto flex gap-6">
          <div className="pt-1">
             <Avatar role="user" imageUrl={userAvatarUrl} />
          </div>
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col w-full gap-4 mt-1 min-w-0"
          >
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              // Styling matches the main chat input bar: dark, focused, clear borders.
              // transition-height enables smooth resizing.
              className="w-full bg-zinc-900 text-zinc-100 border border-blue-500/70 focus:ring-2 focus:ring-blue-500/50 shadow-xl resize-none transition-height duration-200 ease-in-out overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600 p-4 rounded-xl text-base leading-relaxed outline-none"
              rows={1} // Start collapsed; useEffect handles dynamic sizing.
              spellCheck="true"
              aria-label="Edit message content"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                // Secondary button styling
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editContent.trim() || editContent.trim() === message.content}
                // Primary action button styling (Stripe/Vercel standard).
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                Save & Submit
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // 2. Main Render (User or Assistant)

  // Determine visibility of the action bar.
  // Actions are visible on hover/focus (interactionActionsVisible) or when feedback (copied) is active.
  const interactionActionsVisible = showActions || copied;
  // Actions should only be rendered if available AND the message is not actively streaming (avoids UI jitter), unless it's an error retry.
  const shouldShowActions = (!isMessageStreaming || (isError && canRetry)) && (canCopy || canEdit || canRetry);


  return (
    // Container for the entire message row. Manages hover/focus state for A11y.
    <motion.div
      className={containerClasses}
      // Animate only the latest message entry for better perceived performance.
      initial={isLatest ? "hidden" : "visible"}
      animate="visible"
      variants={entryVariants}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} // Snappy cubic bezier (Vercel polish)
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      // Use Focus/Blur Capture for robust keyboard accessibility handling.
      onFocusCapture={() => setShowActions(true)}
      onBlurCapture={() => setShowActions(false)}
      // Make the container focusable (tabIndex={-1}) so keyboard users can reveal actions.
      tabIndex={-1}
      role="listitem"
      aria-label={`${message.role} message`}
      // A11y: Announce updates as they stream in.
      aria-atomic="true"
      aria-live={isMessageStreaming ? "polite" : "off"}
    >
      {/* Constrain width and center content (max-w-3xl mx-auto) for optimal reading length. Gap-6 provides space for avatar. */}
      <div className="max-w-3xl mx-auto flex gap-6">

        {/* Avatar Column */}
        <div className="pt-1">
          <Avatar role={isUser ? 'user' : 'assistant'} imageUrl={isUser ? userAvatarUrl : undefined}>
            {isUser ? undefined : assistantAvatar}
          </Avatar>
        </div>

        {/* Content Column (Flexible width, ensuring it can shrink if needed: min-w-0) */}
        <div className="flex flex-col w-full min-w-0">

          {/* Message Content Container */}
          <div className="text-base leading-relaxed break-words">

            {/* Error State Rendering */}
            {isError && (
              <div className="flex items-center gap-3 font-medium text-red-400 py-3" role="alert">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>Error: {message.content || "An unknown error occurred."}</span>
              </div>
            )}

            {/* Content Rendering Logic */}
            {!isError && (
              isUser ? (
                <div className='text-zinc-100'>
                  {/* User Image Attachments (Displayed before text) */}
                  {images.length > 0 && (
                    <div className="mb-4">
                        <ImageGrid images={images} />
                    </div>
                  )}
                  {/* User messages rendered as plain text with preserved whitespace. */}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ) : (
                // Assistant Message Rendering Pipeline
                <>
                  {/* 1. Search Results (if applicable) */}
                  {message.search_results && message.search_results.length > 0 && (
                    <div className="mb-6">
                      <SearchResults
                        results={message.search_results}
                        metadata={message.metadata?.search_metadata}
                      />
                    </div>
                  )}

                  {/* 2. HTML Live Previews (if applicable) */}
                  {previewGroups.length > 0 && previewGroups.map((group, idx) => (
                    <HTMLPreviewWrapper key={`preview-${message.id}-${idx}`} group={group} />
                  ))}

                  {/* 3. Main Markdown Content */}
                  {message.content ? (
                    // Tailwind Prose Configuration: Optimized for dark mode readability and minimalist aesthetic.
                    // Requires @tailwindcss/typography plugin.
                    <div className="prose prose-invert max-w-none
                        prose-text-base
                        prose-p:my-5 prose-p:leading-7 prose-p:text-zinc-300
                        prose-headings:mt-7 prose-headings:mb-3 prose-headings:font-semibold prose-headings:text-zinc-100
                        prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg
                        prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-a:font-medium prose-a:no-underline hover:prose-a:underline transition-colors
                        prose-strong:text-zinc-200 prose-strong:font-semibold
                        prose-code:text-zinc-200 prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-code:font-medium
                        prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-6
                        prose-ul:my-5 prose-ul:pl-7
                        prose-ol:my-5 prose-ol:pl-7
                        prose-li:my-2 prose-li:leading-6 prose-li:text-zinc-300
                        prose-hr:border-white/10 prose-hr:my-8
                        prose-blockquote:border-l-zinc-600 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-zinc-400
                    ">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {message.content}
                      </ReactMarkdown>
                      {isMessageStreaming && <StreamingCursor />}
                    </div>
                  ) : (
                    // Loading state when content is empty but streaming is active.
                    isMessageStreaming && <TypingIndicator />
                  )}

                   {/* 4. Assistant Image Outputs (if applicable) */}
                   {images.length > 0 && (
                    <div className="mt-6">
                      <ImageGrid images={images} />
                    </div>
                  )}
                </>
              )
            )}
          </div>

          {/* Action Bar (Positioned immediately below content) */}
          {shouldShowActions && (
            <div className="flex items-center gap-1 mt-3">
                <AnimatePresence>
                    {/* Actions fade in when interactionActionsVisible is true. */}
                   {(interactionActionsVisible) && (
                    <motion.div
                        // Subtle fade-in and vertical slide animation
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex items-center gap-0.5"
                        role="toolbar"
                        aria-label="Message actions"
                    >
                        {/* Copy Button */}
                        {canCopy && (
                            <ActionButton onClick={handleCopyMessage} label={copied ? "Copied" : "Copy"}>
                                {/* Advanced Copy Feedback: Physics-based spring animation for tactile response */}
                                <AnimatePresence mode="wait" initial={false}>
                                    {copied ? (
                                    <motion.div
                                        key="check"
                                        // "Pop" effect using spring physics and slight rotation
                                        initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                    >
                                        <Check className="w-4 h-4 text-green-400" />
                                    </motion.div>
                                    ) : (
                                    <motion.div
                                        key="copy"
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ duration: 0.1 }}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                            </ActionButton>
                        )}

                        {/* Edit Button */}
                        {canEdit && (
                            <ActionButton onClick={handleStartEdit} label="Edit">
                                <Edit2 className="w-4 h-4" />
                            </ActionButton>
                        )}

                        {/* Retry/Regenerate Button */}
                        {canRetry && (
                            <ActionButton
                                onClick={handleRetry}
                                label={isError ? "Retry" : "Regenerate"}
                                // Enhance visibility for error retries
                                className={isError ? 'text-red-500 hover:text-red-400 hover:bg-red-900/50' : ''}
                            >
                                <RefreshCcw className="w-4 h-4" />
                            </ActionButton>
                        )}
                    </motion.div>
                   )}
                </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// Update the display name to reflect the architectural change
MessageBlock.displayName = 'MessageBlock';
// Exporting as MessageBubble as well for backward compatibility if needed by the parent component structure
export const MessageBubble = MessageBlock;