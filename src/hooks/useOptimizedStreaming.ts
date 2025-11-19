/**
 * useOptimizedStreaming
 *
 * Enhanced streaming hook with:
 * - Throttled updates
 * - Functional state updates (no stale closures)
 * - Proper cleanup
 * - Performance metrics
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import {
  StreamingTextBuffer,
  useThrottledStreamUpdate,
  StreamingMetrics,
} from '../utils/streamingOptimizations';

interface StreamingState {
  content: string;
  isStreaming: boolean;
  progress: number;
  error: string | null;
}

interface UseOptimizedStreamingOptions {
  throttleMs?: number;
  enableMetrics?: boolean;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
}

export function useOptimizedStreaming(options: UseOptimizedStreamingOptions = {}) {
  const {
    throttleMs = 50,
    enableMetrics = false,
    onComplete,
    onError,
  } = options;

  // State using functional updates to avoid stale closures
  const [state, setState] = useState<StreamingState>({
    content: '',
    isStreaming: false,
    progress: 0,
    error: null,
  });

  // Refs for streaming data
  const bufferRef = useRef(new StreamingTextBuffer());
  const metricsRef = useRef(enableMetrics ? new StreamingMetrics() : null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Callbacks refs to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  // Commit buffer to state
  const commitUpdate = useCallback(() => {
    const content = bufferRef.current.flush();

    // Functional update - no stale closure!
    setState((prev) => ({
      ...prev,
      content,
    }));

    metricsRef.current?.recordUpdate(content.length);
  }, []);

  // Throttled update scheduler
  const { scheduleUpdate, forceUpdate } = useThrottledStreamUpdate(
    commitUpdate,
    throttleMs
  );

  // Start streaming
  const start = useCallback(() => {
    bufferRef.current.clear();
    metricsRef.current?.start();

    setState({
      content: '',
      isStreaming: true,
      progress: 0,
      error: null,
    });

    abortControllerRef.current = new AbortController();
  }, []);

  // Append chunk
  const appendChunk = useCallback(
    (chunk: string) => {
      bufferRef.current.append(chunk);
      scheduleUpdate();
    },
    [scheduleUpdate]
  );

  // Update progress
  const updateProgress = useCallback((progress: number) => {
    setState((prev) => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress)),
    }));
  }, []);

  // Complete streaming
  const complete = useCallback(() => {
    // Force immediate final update
    forceUpdate();

    const finalContent = bufferRef.current.flush();

    setState((prev) => ({
      ...prev,
      content: finalContent,
      isStreaming: false,
      progress: 100,
    }));

    if (enableMetrics && metricsRef.current) {
      const stats = metricsRef.current.getStats();
      console.log('Streaming Performance:', stats);
      metricsRef.current.reset();
    }

    onCompleteRef.current?.(finalContent);
  }, [forceUpdate, enableMetrics]);

  // Handle error
  const handleError = useCallback((error: string) => {
    forceUpdate();

    setState((prev) => ({
      ...prev,
      isStreaming: false,
      error,
    }));

    onErrorRef.current?.(error);
  }, [forceUpdate]);

  // Abort streaming
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    complete();
  }, [complete]);

  // Reset
  const reset = useCallback(() => {
    bufferRef.current.clear();
    metricsRef.current?.reset();

    setState({
      content: '',
      isStreaming: false,
      progress: 0,
      error: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      bufferRef.current.clear();
    };
  }, []);

  return {
    // State
    content: state.content,
    isStreaming: state.isStreaming,
    progress: state.progress,
    error: state.error,

    // Methods
    start,
    appendChunk,
    updateProgress,
    complete,
    handleError,
    abort,
    reset,

    // Utils
    getAbortSignal: () => abortControllerRef.current?.signal,
  };
}

/**
 * Simplified hook for basic streaming without all the bells and whistles
 */
export function useSimpleStreaming() {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bufferRef = useRef(new StreamingTextBuffer());

  const { scheduleUpdate, forceUpdate } = useThrottledStreamUpdate(() => {
    // Functional update to avoid stale closures
    setContent(bufferRef.current.flush());
  });

  const start = useCallback(() => {
    bufferRef.current.clear();
    setContent('');
    setIsStreaming(true);
  }, []);

  const append = useCallback(
    (chunk: string) => {
      bufferRef.current.append(chunk);
      scheduleUpdate();
    },
    [scheduleUpdate]
  );

  const complete = useCallback(() => {
    forceUpdate();
    setIsStreaming(false);
  }, [forceUpdate]);

  return { content, isStreaming, start, append, complete };
}
