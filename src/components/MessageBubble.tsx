// src/components/MessageBubble.tsx
import React, { useState, memo, useCallback, useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from '../types';
import { Edit2, Check, X, Copy, RefreshCcw, AlertTriangle, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Components } from 'react-markdown';

// Assuming these imports are correct based on the original code
import { CodeBlock } from './CodeBlock';
import { HTMLPreview } from './HTMLPreview';
import { DiagramBlock } from './DiagramBlock';
import { ApiSpecViewer } from './ApiSpecViewer';
import { ImageGrid } from './images/ImageGrid';
import { SearchResults } from './SearchResults';
import { detectSnippets, PreviewGroup, describePreviewGroup } from '../utils/htmlDetector';
import { combineHtml } from '../utils/htmlCombiner';
import yaml from 'js-yaml';

interface MessageBubbleProps {
  // Added timestamp assumption for metadata display
  message: ChatMessage & { timestamp?: number };
  isLatest: boolean;
  isStreaming: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  // Unified retry/regenerate handler
  onRetry?: (messageId: string) => void;
}

// --- Refined Sub-components & Helpers ---

// 1. Refined Streaming Cursor: Thinner, smoother "breathing" pulse.
const StreamingCursor = React.memo(() => (
  <motion.span
    // Using em units for precise scaling with font size; thinner width (2px)
    className="inline-block w-[2px] h-[1.1em] bg-white/95 ml-[2px] rounded-full align-text-bottom"
    animate={{ opacity: [0.3, 1, 0.3] }}
    transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }}
  />
));
StreamingCursor.displayName = 'StreamingCursor';

// 2. Refined Typing Indicator (Used when streaming but no content yet)
const TypingIndicator = React.memo(() => (
    <div className="flex items-center gap-1.5 py-1 px-1">
        <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8 }}/>
        <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }}/>
        <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }}/>
    </div>
));
TypingIndicator.displayName = 'TypingIndicator';


// 3. HTML Preview Wrapper with enhanced container and header
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

  if (!combinedHtml) return null;

  // Refined styling: Stronger shadow, subtle border, distinct header.
  return (
    // Added subtle entry animation
    <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="liquid-glass-code my-6 rounded-[20px] overflow-hidden shadow-xl shadow-black/20 border border-white/10"
    >
      {/* Distinct Header Bar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white/5 text-sm font-medium text-white/70 backdrop-blur-sm border-b border-white/5">
        <Monitor className="w-4 h-4"/>
        <span>Live Preview: {title}</span>
      </div>
      <HTMLPreview srcDoc={combinedHtml} title={title} />
    </motion.div>
  );
});
HTMLPreviewWrapper.displayName = 'HTMLPreviewWrapper';

// 4. ActionButton Helper (Encapsulates micro-interactions and styling)
interface ActionButtonProps {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}

const ActionButton = memo(({ onClick, label, children, disabled = false }: ActionButtonProps) => (
  <motion.button
    onClick={onClick}
    // Subtle glass background on hover, refined colors, accessible focus ring
    className="p-2.5 rounded-[12px] text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150 disabled:opacity-40 focus-ring-premium"
    aria-label={label}
    title={label}
    whileTap={{ scale: 0.95 }} // Micro-interaction: button press feel
    disabled={disabled}
  >
    {children}
  </motion.button>
));
ActionButton.displayName = 'ActionButton';

// 5. MessageMetadata (Timestamps)
const MessageMetadata = memo(({ timestamp }: { timestamp: number }) => {
    const date = new Date(timestamp);
    // e.g., "8:28 PM"
    const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    return (
        <div className="text-xs font-medium text-white/40 mt-1.5 px-1">
            <span>{timeString}</span>
        </div>
    );
});
MessageMetadata.displayName = 'MessageMetadata';


// --- Main MessageBubble Component ---

export const MessageBubble: React.FC<MessageBubbleProps> = memo(({
  message,
  isLatest,
  isStreaming,
  onEditMessage,
  onRetry
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  // Manage visibility of actions via state for accessibility (keyboard focus) and interaction stability
  const [showActions, setShowActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State definitions
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isMessageStreaming = isStreaming && isLatest && message.role === 'assistant' && !isError;

  // Permissions
  const canEdit = isUser && !!onEditMessage && !isStreaming && !isError;
  // Retry is available if handler exists, not streaming, and either it's an error OR it's the latest assistant message (for regeneration)
  const canRetry = !!onRetry && !isStreaming && (isError || (isLatest && !isUser));
  const canCopy = !!message.content && !isError && !isUser;

  // Detect HTML preview groups
  const previewGroups = useMemo(() => {
    // Do not process previews if the message is from the user or if there is an error.
    if (isUser || !message.content || isError) return [];
    try {
      const groups = detectSnippets(message.content);
      // Ensure robustness by filtering potential nulls
      return Array.isArray(groups) ? groups.filter(g => g) : [];
    } catch (error) {
      console.error('Error detecting snippets:', error);
      return [];
    }
  }, [message.content, isUser, isError]);

  // Robust Auto-resize textarea implementation
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.focus();
      // Reset height to 'auto' before calculating scrollHeight for accuracy when shrinking/growing
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      // Requires 'transition-height' duration defined in CSS for smooth animation
      textarea.style.height = `${Math.min(scrollHeight, 400)}px`; // Constrained max height
    }
  }, [isEditing, editContent]);

  // --- Handlers ---

  const handleStartEdit = useCallback(() => {
    if (canEdit) {
      setEditContent(message.content);
      setIsEditing(true);
      setShowActions(false); // Hide actions when editing starts
    }
  }, [canEdit, message.content]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent(message.content);
  }, [message.content]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ensure only Enter (without modifiers) triggers save
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleCopyMessage = useCallback(() => {
    if (!canCopy) return;
    // Use modern async clipboard API if available
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(message.content).then(() => {
            setCopied(true);
            // Faster feedback loop (1500ms)
            setTimeout(() => setCopied(false), 1500);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }
  }, [message.content, canCopy]);

  // --- Markdown Configuration ---

  // Markdown components configuration (Memoized for performance)
  const markdownComponents: Components = useMemo(() => ({
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeString = String(children).replace(/\n$/, '');

      if (!inline && language) {
        // 1. Handle specialized renderers (Mermaid, OpenAPI)
        if (language === 'mermaid') {
          return <DiagramBlock code={codeString} />;
        }

        if ((language === 'yaml' || language === 'yml') && (codeString.includes('openapi:') || codeString.includes('swagger:'))) {
          try {
            const spec = yaml.load(codeString);
            // Validate spec before rendering
            if (typeof spec === 'object' && spec !== null) {
              return <ApiSpecViewer spec={spec as any} />;
            }
          } catch {
            // Fall through to regular code block if parsing fails
          }
        }

        // 2. Check if this code block should be hidden because it's rendered in a PreviewGroup.
        // Use precise matching for robustness.
        const isInPreviewGroup = previewGroups.some(group =>
          group.html === codeString ||
          group.css === codeString ||
          group.js === codeString
        );

        if (isInPreviewGroup) {
          return null;
        }

        // 3. Standard Code Block
        return (
          <CodeBlock
            language={language}
            value={codeString}
            isStreaming={isMessageStreaming}
            {...props}
          />
        );
      }

      // Inline code styling - refined for better readability and aesthetics
      return (
        <code className="px-[0.4em] py-[0.2em] bg-white/15 rounded-[4px] text-[0.9em] font-mono font-medium text-white/95 shadow-sm" {...props}>
          {children}
        </code>
      );
    },
    // Ensure links open securely (Styling handled by Prose below)
    a: ({ node, children, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,

    // Ensure tables look good within the glass aesthetic (Overrides Prose styles)
    table: ({ children, ...props }) => <div className="overflow-x-auto my-5 liquid-glass-table rounded-lg border border-white/10 shadow-md"><table className="w-full text-left" {...props}>{children}</table></div>,
    th: ({ children, ...props }) => <th className="px-4 py-2 font-semibold text-white/90 bg-white/10 backdrop-blur-sm" {...props}>{children}</th>,
    td: ({ children, ...props }) => <td className="px-4 py-2 border-t border-white/10" {...props}>{children}</td>,
    // Subtle hover effect on rows
    tr: ({ children, ...props }) => <tr className="hover:bg-white/5 transition-colors duration-150" {...props}>{children}</tr>
  }), [previewGroups, isMessageStreaming]);

  // --- Styling ---

  // Refined bubble styling. Softer corners (24px, iOS style), standardized font size (16px), and improved depth.
  // Added 'antialiased' for superior font rendering.
  let bubbleClasses = 'relative overflow-hidden rounded-[24px] px-5 py-4 text-[16px] leading-normal transition-all duration-300 antialiased';

  if (isUser) {
    bubbleClasses += ' liquid-glass-user text-white shadow-lg shadow-black/10';
  } else if (isError) {
    // Distinct error styling with appropriate shadow and border
    bubbleClasses += ' liquid-glass-error text-red-100 shadow-lg shadow-red-900/20 border border-red-500/20';
  } else {
    // Assistant bubble has more depth and refined text color
    bubbleClasses += ' liquid-glass-assistant text-white/98 shadow-xl shadow-black/15';
  }

  // Animation variants for the bubble entry
  const bubbleVariants = {
    hidden: { opacity: 0, scale: 0.98, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0 },
  };

  // --- Render Logic ---

  // 1. Render Editing Interface
  if (isEditing) {
    return (
      // Increased vertical padding (py-3) for better separation
      <div className={`flex w-full py-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {/* Smooth transition into edit mode */}
        <motion.div
            initial={{ opacity: 0.9, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col w-full max-w-[90%] lg:max-w-[85%] gap-4"
        >
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            // Enhanced styling: Matching aesthetic, smooth resizing (requires transition-height in CSS), refined scrollbar.
            // 'liquid-glass-user-editing' assumed to be a focused state variant of the user bubble style.
            className="w-full liquid-glass-user-editing text-white focus-ring-premium resize-none transition-height duration-200 ease-in-out max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent p-5 rounded-[24px] text-[16px] leading-normal shadow-xl"
            rows={1} // Start with 1 row and let useEffect handle sizing
            autoFocus
            spellCheck="true"
            aria-label="Edit message content"
          />
          <div className="flex justify-end gap-3">
            {/* Refined button styles (Secondary vs Primary) - assuming these CSS classes exist */}
            <button
              onClick={handleCancelEdit}
              // Secondary style
              className="liquid-glass-button-secondary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white rounded-[14px] focus-ring-premium transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editContent.trim() || editContent.trim() === message.content}
              // Primary style
              className="liquid-glass-button-primary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-[14px] focus-ring-premium transition-opacity duration-150 shadow-md"
            >
              Save & Resubmit
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. Main Render (User or Assistant)

  // Determine if actions should be visible (hover, focus, recently copied, or persistent error state).
  // Actions are hidden during streaming unless it's an error state that allows retry.
  const shouldShowActions = (showActions || copied || isError) && (!isMessageStreaming || (isError && canRetry));

  return (
    // Container for the bubble, actions, and metadata. Manages hover/focus state for accessibility.
    <div
        // Increased vertical padding (py-3) for better separation
        className={`flex flex-col py-3 transition-all duration-300 ${isUser ? 'items-end' : 'items-start'}`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        // Use FocusCapture/BlurCapture for robust focus handling within the component tree (including buttons)
        onFocusCapture={() => setShowActions(true)}
        onBlurCapture={() => setShowActions(false)}
        // Make the container focusable (tabIndex={-1}) to allow keyboard users to reveal actions by focusing the area
        tabIndex={-1}
        role="listitem"
    >
      {/* The Bubble itself */}
      <motion.div
          className={bubbleClasses}
          // Constrained width
          style={{ maxWidth: '85%' }}
          initial={isLatest ? "hidden" : "visible"} // Only animate the entry of the latest message
          animate="visible"
          variants={bubbleVariants}
          transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Error State Rendering (Inside the bubble) */}
        {isError && (
            <div className="flex items-center gap-3 font-medium">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span>An error occurred. {message.content}</span>
            </div>
        )}

        {/* Content Rendering */}
        {!isError && (
            isUser ? (
                // User messages are rendered as plain text
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
            ) : (
                <>
                    {/* Assistant: Render search results first if present */}
                  {message.search_results && message.search_results.length > 0 && (
                    <div className="mb-4">
                      <SearchResults
                        results={message.search_results}
                        metadata={message.metadata?.search_metadata}
                      />
                    </div>
                  )}
                    {/* Assistant: Render HTML preview groups first */}
                  {previewGroups.length > 0 && previewGroups.map((group, idx) => (
                    <HTMLPreviewWrapper key={`preview-${message.id}-${idx}`} group={group} />
                  ))}

                    {/* Assistant: Render markdown content */}
                    {message.content ? (
                        // Use Tailwind Prose for typography control. Customized for dark/glass background.
                        // Requires Tailwind Typography plugin.
                      <div className="prose prose-invert prose-base max-w-none
                                    prose-headings:font-semibold prose-headings:text-white
                                    prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-a:transition-colors prose-a:duration-200
                                    prose-a:underline decoration-blue-400/50 hover:decoration-blue-300/80
                                    prose-strong:text-white prose-strong:font-medium
                                    prose-blockquote:border-l-4 prose-blockquote:border-white/30 prose-blockquote:text-white/80 prose-blockquote:pl-4 prose-blockquote:italic
                                    prose-hr:border-white/20
                                    prose-li:my-0.5
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
                        // Loading state when content is empty but streaming
                        isMessageStreaming && <TypingIndicator />
                    )}
                </>
            )
        )}
      </motion.div>


      {/* Image Attachments - Displayed outside bubble for better presentation */}
      {message.files && message.files.length > 0 && (
        <ImageGrid
          images={message.files
            .filter(file => file.url && (file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)))
            .map(file => ({
              url: file.url!,
              thumbnail_url: file.url,
              filename: file.name,
              width: 800,
              height: 600,
            }))}
        />
      )}
      {/* Footer: Action Bar and Metadata (Intelligent switching) */}
      <div className={`flex items-center gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Action Buttons (Appear below the bubble on hover/focus) */}
        <AnimatePresence>
            {shouldShowActions && (
                <motion.div
                    // Subtle vertical slide-in and fade
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex items-center gap-1 mt-1.5"
                    role="toolbar"
                    aria-label="Message actions"
                >
                    {/* Copy Button */}
                    {canCopy && (
                        <ActionButton onClick={handleCopyMessage} label={copied ? "Copied" : "Copy"}>
                            {/* Advanced Copy Feedback: Spring animation for tactile response */}
                             <AnimatePresence mode="wait" initial={false}>
                                {copied ? (
                                    <motion.div
                                        key="check"
                                        // Physics-based "pop" effect with slight rotation
                                        initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
                                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    >
                                        <Check className="w-4 h-4 text-green-400" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="copy"
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
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
                        <ActionButton onClick={handleRetry} label={isError ? "Retry" : "Regenerate"}>
                            <RefreshCcw className="w-4 h-4" />
                        </ActionButton>
                    )}
                </motion.div>
            )}
        </AnimatePresence>

        {/* Metadata (Subtly visible when actions are not shown) */}
        <AnimatePresence>
            {!shouldShowActions && message.timestamp && (
                 <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                 >
                    <MessageMetadata timestamp={message.timestamp} />
                </motion.div>
            )}
        </AnimatePresence>
      </div>

    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';