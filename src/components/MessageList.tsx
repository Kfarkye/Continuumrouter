// src/components/MessageList.tsx
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';
// ENHANCEMENT: Use Cpu icon for AI feel
import { ArrowDown, Cpu } from 'lucide-react';
import { Spinner } from './Spinner';
import { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
// POLISH: Define Apple-like easing curve for smooth deceleration
const APPLE_EASE_DECELERATE = [0.22, 1, 0.36, 1];
interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory?: boolean; // Added for initial load state
  // Pagination props removed
  onEditMessage?: (messageId: string, newContent: string) => void; // NEW
}
const MemoizedMessageBubble = memo(MessageBubble, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    // ENHANCEMENT: Check metadata changes as they might affect rendering
    JSON.stringify(prev.message.metadata) === JSON.stringify(next.message.metadata) &&
    prev.isStreaming === next.isStreaming &&
    prev.isLatest === next.isLatest &&
    prev.onEditMessage === next.onEditMessage
  );
});
MemoizedMessageBubble.displayName = 'MemoizedMessageBubble';
// --- Hooks ---
// Note: useInfiniteScrollReversed removed as pagination is not implemented.
/**
 * useScrollActivity (For A11y optimization)
 */
function useScrollActivity(containerRef: React.RefObject<HTMLElement>): boolean {
  const [isScrolling, setIsScrolling] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      setIsScrolling(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [containerRef]);
  return isScrolling;
}
interface UseAutoScrollResult {
  isAtBottom: boolean;
  showScrollToBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}
const SCROLL_BOTTOM_THRESHOLD = 120; // Increased threshold slightly
/**
 * useAutoScrollReversed
 * Adapted for Reverse Layout and robust streaming.
 */
function useAutoScrollReversed(
  containerRef: React.RefObject<HTMLDivElement>,
  lastMessage: ChatMessage | null,
  messageCount: number,
  isStreaming: boolean
): UseAutoScrollResult {
  const [state, setState] = useState({ isAtBottom: true });
  const userScrolledRef = useRef(false);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    userScrolledRef.current = false;
    setState({ isAtBottom: true });
  }, [containerRef]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const checkIfAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
      setState({ isAtBottom });
    };
    const handleScroll = () => {
      userScrolledRef.current = true;
      checkIfAtBottom();
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    checkIfAtBottom();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);
  useLayoutEffect(() => {
    if (isStreaming && state.isAtBottom && !userScrolledRef.current) {
      const container = containerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [lastMessage, isStreaming, state.isAtBottom, containerRef]);
  useLayoutEffect(() => {
    if (messageCount > 0 && !userScrolledRef.current) {
      scrollToBottom('auto');
    }
  }, [messageCount, scrollToBottom]);
  return {
    isAtBottom: state.isAtBottom,
    showScrollToBottom: !state.isAtBottom,
    scrollToBottom,
  };
}
// --- Component ---
/**
 * MessageList
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  isLoadingHistory = false,
  onEditMessage,
}) => {
  type ScrollContainer = HTMLDivElement;
  type VirtualItemElement = HTMLDivElement;
  const scrollContainerRef = useRef<ScrollContainer>(null);
  const isInitialRenderRef = useRef(true); // Used for animation control
  // Normal order: oldest at top, newest at bottom (like ChatGPT)
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const { showScrollToBottom, scrollToBottom } = useAutoScrollReversed(
    scrollContainerRef,
    lastMessage,
    messages.length,
    isStreaming
  );
  const isScrolling = useScrollActivity(scrollContainerRef);
  const isBusy = isScrolling || isStreaming;
  useEffect(() => {
    isInitialRenderRef.current = false;
  }, []);
  const virtualizer = useVirtualizer<ScrollContainer, VirtualItemElement>({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150,
    overscan: 10,
  });
  // ENHANCEMENT: Loading State
  if (isLoadingHistory) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 antialiased">
        <Spinner size="lg" color="white" />
        <p className="mt-4 text-sm text-zinc-500 animate-pulse">Loading conversation...</p>
      </div>
    );
  }
  // --- Empty State (Minimalist) ---
  if (messages.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 antialiased">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: APPLE_EASE_DECELERATE }}
          className="
              flex h-24 w-24 items-center justify-center rounded-3xl
              glass-panel shadow-glow-sm
            "
        >
          <Cpu className="h-10 w-10 text-zinc-400" strokeWidth={1.5} />
        </motion.div>
        <motion.h3
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: APPLE_EASE_DECELERATE }}
          className="mt-6 text-xl font-medium text-white tracking-tight">
          How can I assist you today?
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: APPLE_EASE_DECELERATE }}
          className="mt-2 text-sm text-zinc-400 text-center max-w-xs leading-relaxed">
          Type a message or upload files to begin.
        </motion.p>
      </div>
    );
  }
  return (
    <div className="relative flex w-full flex-1 overflow-hidden antialiased">
      <div
        ref={scrollContainerRef}
        // POLISH: Applying the hyper-minimalist scrollbar utilities
        className="relative flex h-full w-full flex-col items-center overflow-y-auto
                   custom-scrollbar
                   transition-colors duration-300"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={isBusy}
        aria-label="Chat History"
      >
        {/* Use max-w-thread-wide for comfortable reading width */}
        <div className="w-full max-w-5xl px-4 pt-4 pb-6 md:px-6 lg:px-8">
          <div
            role="list"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const index = virtualRow.index;
              const message = messages[index];
              if (!message) return null;
              const isLatest = index === messages.length - 1;
              const isMessageStreaming =
                isStreaming && isLatest && message.status === 'streaming';
              const shouldAnimate = isLatest && !isInitialRenderRef.current;
              return (
                <div
                  key={message.id}
                  role="listitem"
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                    margin: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <motion.div
                    // POLISH: Subtle entry animation (15px)
                    initial={shouldAnimate ? { opacity: 0, y: 10 } : false}
                    animate={shouldAnimate ? { opacity: 1, y: 0 } : undefined}
                    transition={{ duration: 0.4, ease: APPLE_EASE_DECELERATE }}
                  >
                    <MemoizedMessageBubble
                      message={message}
                      isLatest={isLatest}
                      isStreaming={isMessageStreaming}
                      onEditMessage={onEditMessage} // NEW: Pass the handler down
                    />
                  </motion.div>
                </div>
              );
            })}
          </div>
          {/* Removed Pagination Controls (Load More/Spinner) as they are not supported by the simplified hook */}
        </div>
      </div>
      {/* --- Scroll to Bottom Button (Minimalist) --- */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <AnimatePresence initial={false}>
          {showScrollToBottom && (
            <motion.button
              key="scroll-to-bottom"
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="
                    pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full
                    bg-zinc-800/80 backdrop-blur-md border border-white/10
                    text-zinc-400 hover:text-white hover:bg-zinc-700
                    shadow-lg transition-all duration-200
                "
              aria-label="Scroll to latest messages"
              // POLISH: Tactile spring animation
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowDown className="h-4 w-4" strokeWidth={2} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};