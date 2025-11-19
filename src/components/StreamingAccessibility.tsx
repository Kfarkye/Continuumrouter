/**
 * Streaming Accessibility Components
 *
 * ARIA live regions and announcements for streaming content
 */

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface StreamingAnnouncerProps {
  isStreaming: boolean;
  progress?: number;
  step?: string;
  error?: string | null;
  className?: string;
}

/**
 * Live region announcer for streaming updates
 */
export const StreamingAnnouncer: React.FC<StreamingAnnouncerProps> = ({
  isStreaming,
  progress = 0,
  step = '',
  error,
  className,
}) => {
  const [announcement, setAnnouncement] = useState('');
  const lastAnnouncementRef = useRef('');
  const announcementTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Clear existing timer
    if (announcementTimerRef.current) {
      clearTimeout(announcementTimerRef.current);
    }

    let newAnnouncement = '';

    if (error) {
      newAnnouncement = `Error: ${error}`;
    } else if (isStreaming) {
      // Announce progress milestones only
      if (progress === 0) {
        newAnnouncement = 'Starting to generate response';
      } else if (progress === 100) {
        newAnnouncement = 'Response complete';
      } else if (progress >= 50 && lastAnnouncementRef.current !== 'halfway') {
        newAnnouncement = 'Response halfway complete';
        lastAnnouncementRef.current = 'halfway';
      }
    } else if (!isStreaming && progress === 100) {
      newAnnouncement = 'Response finished';
    }

    // Debounce announcements to avoid spam
    if (newAnnouncement && newAnnouncement !== announcement) {
      announcementTimerRef.current = window.setTimeout(() => {
        setAnnouncement(newAnnouncement);
      }, 500);
    }

    return () => {
      if (announcementTimerRef.current) {
        clearTimeout(announcementTimerRef.current);
      }
    };
  }, [isStreaming, progress, error, announcement]);

  return (
    <div
      className={cn('sr-only', className)}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </div>
  );
};

/**
 * Progress announcer for long-running streams
 */
export const ProgressAnnouncer: React.FC<{
  progress: number;
  message?: string;
}> = ({ progress, message }) => {
  const [announcement, setAnnouncement] = useState('');
  const lastProgressRef = useRef(0);

  useEffect(() => {
    // Only announce at significant milestones
    const milestones = [0, 25, 50, 75, 100];
    const currentMilestone = milestones.find(
      (m) => progress >= m && lastProgressRef.current < m
    );

    if (currentMilestone !== undefined) {
      let text = `${currentMilestone}% complete`;
      if (message) {
        text += `. ${message}`;
      }
      setAnnouncement(text);
      lastProgressRef.current = currentMilestone;
    }
  }, [progress, message]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
};

/**
 * Error announcer with assertive politeness
 */
export const ErrorAnnouncer: React.FC<{
  error: string | null;
  onClear?: () => void;
}> = ({ error, onClear }) => {
  useEffect(() => {
    if (error && onClear) {
      // Clear after announcement
      const timer = setTimeout(onClear, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, onClear]);

  if (!error) return null;

  return (
    <div
      className="sr-only"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {error}
    </div>
  );
};

/**
 * Hook for managing streaming accessibility
 */
export function useStreamingAccessibility(isStreaming: boolean, content: string) {
  const [wordCount, setWordCount] = useState(0);
  const lastContentLengthRef = useRef(0);
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    // Debounce word count updates
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    updateTimerRef.current = window.setTimeout(() => {
      const words = content.trim().split(/\s+/).filter(Boolean).length;

      // Only update if significant change (every 10 words)
      if (Math.abs(words - lastContentLengthRef.current) >= 10) {
        setWordCount(words);
        lastContentLengthRef.current = words;
      }
    }, 1000);

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [isStreaming, content]);

  return {
    wordCount,
    shouldAnnounce: isStreaming && wordCount > 0,
  };
}

/**
 * Visual + Accessible loading indicator
 */
export const AccessibleLoadingIndicator: React.FC<{
  isLoading: boolean;
  message?: string;
  className?: string;
}> = ({ isLoading, message = 'Loading', className }) => {
  if (!isLoading) return null;

  return (
    <>
      {/* Visual indicator */}
      <div
        className={cn('flex items-center gap-2', className)}
        aria-hidden="true"
      >
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm text-zinc-400">{message}</span>
      </div>

      {/* Screen reader announcement */}
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
};

/**
 * Skip to content link for accessibility
 */
export const SkipToContent: React.FC<{ targetId: string }> = ({ targetId }) => {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
};
