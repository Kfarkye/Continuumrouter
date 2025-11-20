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
    <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8 }} />
    <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }} />
    <motion.span className="w-1.5 h-1.5 bg-white/70 rounded-full" animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }} />
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
      className="my-6 rounded-xl overflow-hidden shadow-glass border border-white/10 bg-zinc-900/50"
    >
      {/* Distinct Header Bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 text-xs font-medium text-zinc-400 backdrop-blur-sm border-b border-white/5">
        <Monitor className="w-3.5 h-3.5" />
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
    className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors duration-150 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
    <div className="text-[10px] font-medium text-zinc-500 mt-1 px-1">
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
        <code className="px-1.5 py-0.5 bg-white/10 rounded-md text-sm font-mono font-medium text-zinc-200 border border-white/5" {...props}>
          {children}
        </code>
      );
    },
    // Ensure links open securely (Styling handled by Prose below)
    a: ({ node, children, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,

    // Ensure tables look good within the glass aesthetic (Overrides Prose styles)
    table: ({ children, ...props }) => <div className="overflow-x-auto my-4 rounded-lg border border-white/10"><table className="w-full text-left text-sm" {...props}>{children}</table></div>,
    th: ({ children, ...props }) => <th className="px-4 py-2 font-semibold text-zinc-300 bg-white/5" {...props}>{children}</th>,
    td: ({ children, ...props }) => <td className="px-4 py-2 border-t border-white/5 text-zinc-400" {...props}>{children}</td>,
    // Subtle hover effect on rows
    tr: ({ children, ...props }) => <tr className="hover:bg-white/5 transition-colors duration-150" {...props}>{children}</tr>
  }), [previewGroups, isMessageStreaming]);

  // --- Styling ---

  // Refined bubble styling.
  let bubbleClasses = 'relative overflow-hidden rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed transition-all duration-300 antialiased max-w-full';

  if (isUser) {
    // User: Minimalist dark gray/black with subtle border
    bubbleClasses += ' bg-zinc-800 text-zinc-100 border border-white/5';
  } else if (isError) {
    // Error: Red tint
    bubbleClasses += ' bg-red-500/10 text-red-200 border border-red-500/20';
  } else {
    // Assistant: Transparent/Glass
    bubbleClasses += ' bg-transparent text-zinc-300';
  }

  // Animation variants for the bubble entry
  const bubbleVariants = {
    hidden: { opacity: 0, scale: 0.98, y: 5 },
    visible: { opacity: 1, scale: 1, y: 0 },
  };

  // --- Render Logic ---

  // 1. Render Editing Interface
  if (isEditing) {
    return (
      <div className={`flex w-full py-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {/* Smooth transition into edit mode */}
        <motion.div
          initial={{ opacity: 0.9, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col w-full max-w-[90%] gap-3"
        >
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-zinc-800 text-zinc-100 border border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 resize-none transition-all duration-200 ease-in-out max-h-[400px] overflow-y-auto scrollbar-hide p-4 rounded-2xl text-[15px] leading-relaxed shadow-lg outline-none"
            rows={1} // Start with 1 row and let useEffect handle sizing
            autoFocus
            spellCheck="true"
            aria-label="Edit message content"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editContent.trim() || editContent.trim() === message.content}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors duration-150 shadow-sm"
            >
              Save
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
      className={`flex flex-col py-2 transition-all duration-300 group ${isUser ? 'items-end' : 'items-start'}`}
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
        style={{ maxWidth: isUser ? '85%' : '100%' }}
        initial={isLatest ? "hidden" : "visible"} // Only animate the entry of the latest message
        animate="visible"
        variants={bubbleVariants}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Error State Rendering (Inside the bubble) */}
        {isError && (
          <div className="flex items-center gap-3 font-medium">
            <AlertTriangle className="w-4 h-4 text-red-400" />
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
                <div className="prose prose-invert prose-sm max-w-none
                                    prose-p:text-zinc-300 prose-p:leading-7
                                    prose-headings:font-medium prose-headings:text-zinc-100
                                    prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-a:no-underline hover:prose-a:underline
                                    prose-strong:text-zinc-100 prose-strong:font-medium
                                    prose-code:text-zinc-200 prose-code:bg-white/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                                    prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
                                    prose-ul:my-2 prose-li:my-0.5
                                    prose-hr:border-white/10
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
      <div className={`flex items-center gap-2 mt-1 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Action Buttons (Appear below the bubble on hover/focus) */}
        <AnimatePresence>
          {shouldShowActions && (
            <motion.div
              // Subtle vertical slide-in and fade
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
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </ActionButton>
              )}

              {/* Edit Button */}
              {canEdit && (
                <ActionButton onClick={handleStartEdit} label="Edit">
                  <Edit2 className="w-3.5 h-3.5" />
                </ActionButton>
              )}

              {/* Retry/Regenerate Button */}
              {canRetry && (
                <ActionButton onClick={handleRetry} label={isError ? "Retry" : "Regenerate"}>
                  <RefreshCcw className="w-3.5 h-3.5" />
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
```