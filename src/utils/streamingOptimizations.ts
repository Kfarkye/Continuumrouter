/**
 * Streaming Performance Optimizations
 *
 * Implements throttling, buffering, and batching for high-performance streaming updates
 */

import { useRef, useCallback, useEffect } from 'react';

// Configuration
const DEFAULT_THROTTLE_MS = 50; // Update UI every 50ms max
const CHUNK_BATCH_SIZE = 5; // Batch small chunks together

/**
 * TextBuffer with efficient batching and throttling
 */
export class StreamingTextBuffer {
  private chunks: string[] = [];
  private cache = '';
  private isDirty = false;

  append(text: string) {
    if (!text) return;
    this.chunks.push(text);
    this.isDirty = true;
  }

  flush(): string {
    if (this.isDirty) {
      this.cache = this.chunks.join('');
      this.isDirty = false;
    }
    return this.cache;
  }

  clear() {
    this.chunks = [];
    this.cache = '';
    this.isDirty = false;
  }

  get isEmpty() {
    return this.chunks.length === 0;
  }
}

/**
 * Hook for throttled streaming updates using RAF + throttle
 */
export function useThrottledStreamUpdate(
  callback: () => void,
  throttleMs: number = DEFAULT_THROTTLE_MS
) {
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef(false);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const scheduleUpdate = useCallback(() => {
    if (pendingUpdateRef.current) return;

    pendingUpdateRef.current = true;

    const performUpdate = () => {
      const now = performance.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;

      if (timeSinceLastUpdate >= throttleMs) {
        lastUpdateRef.current = now;
        pendingUpdateRef.current = false;
        callbackRef.current();
      } else {
        // Schedule for later
        const delay = throttleMs - timeSinceLastUpdate;
        rafRef.current = requestAnimationFrame(() => {
          setTimeout(performUpdate, delay);
        });
      }
    };

    rafRef.current = requestAnimationFrame(performUpdate);
  }, [throttleMs]);

  const forceUpdate = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingUpdateRef.current = false;
    lastUpdateRef.current = performance.now();
    callbackRef.current();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { scheduleUpdate, forceUpdate };
}

/**
 * Chunk batching for small rapid updates
 */
export class ChunkBatcher {
  private queue: string[] = [];
  private onFlush: (batch: string) => void;
  private timeoutId: number | null = null;
  private flushDelay: number;

  constructor(onFlush: (batch: string) => void, flushDelay = 100) {
    this.onFlush = onFlush;
    this.flushDelay = flushDelay;
  }

  add(chunk: string) {
    this.queue.push(chunk);

    if (this.queue.length >= CHUNK_BATCH_SIZE) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.timeoutId !== null) return;

    this.timeoutId = window.setTimeout(() => {
      this.flush();
    }, this.flushDelay);
  }

  flush() {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.join('');
    this.queue = [];
    this.onFlush(batch);
  }

  clear() {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.queue = [];
  }
}

/**
 * Partial markdown state detector
 */
export class PartialMarkdownDetector {
  /**
   * Check if markdown is in an incomplete state
   */
  static isIncomplete(text: string): boolean {
    const trimmed = text.trimEnd();

    // Check for unclosed code blocks
    const codeBlockMatches = trimmed.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      return true;
    }

    // Check for incomplete inline code
    const lines = trimmed.split('\n');
    const lastLine = lines[lines.length - 1];
    const backticks = (lastLine.match(/`/g) || []).length;
    if (backticks % 2 !== 0) {
      return true;
    }

    // Check for incomplete list items
    if (/^\s*[-*+]\s*$/.test(lastLine)) {
      return true;
    }

    // Check for incomplete headers
    if (/^#{1,6}\s*$/.test(lastLine)) {
      return true;
    }

    return false;
  }

  /**
   * Attempt to close incomplete markdown gracefully
   */
  static tryClose(text: string): string {
    const trimmed = text.trimEnd();

    // Close unclosed code blocks
    const codeBlockMatches = trimmed.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
      return trimmed + '\n```';
    }

    return trimmed;
  }

  /**
   * Split content into stable blocks and streaming tail
   */
  static splitStableContent(text: string): { stable: string; streaming: string } {
    const lines = text.split('\n');

    // Find the last complete paragraph or block
    let stableEndIndex = lines.length;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];

      // Empty line often indicates paragraph boundary
      if (line.trim() === '') {
        stableEndIndex = i + 1;
        break;
      }

      // Code block boundary
      if (line.trim() === '```') {
        const blocksBefore = lines.slice(0, i).filter(l => l.trim() === '```').length;
        if (blocksBefore % 2 === 0) {
          stableEndIndex = i + 1;
          break;
        }
      }
    }

    // Keep at least last 3 lines as streaming for smooth updates
    const minStreamingLines = 3;
    stableEndIndex = Math.min(stableEndIndex, lines.length - minStreamingLines);

    if (stableEndIndex <= 0) {
      return { stable: '', streaming: text };
    }

    const stable = lines.slice(0, stableEndIndex).join('\n');
    const streaming = lines.slice(stableEndIndex).join('\n');

    return { stable, streaming };
  }
}

/**
 * Performance metrics for debugging
 */
export class StreamingMetrics {
  private updates = 0;
  private startTime = 0;
  private totalBytes = 0;

  start() {
    this.updates = 0;
    this.startTime = performance.now();
    this.totalBytes = 0;
  }

  recordUpdate(bytes: number = 0) {
    this.updates++;
    this.totalBytes += bytes;
  }

  getStats() {
    const duration = performance.now() - this.startTime;
    const updatesPerSecond = this.updates / (duration / 1000);
    const bytesPerSecond = this.totalBytes / (duration / 1000);

    return {
      updates: this.updates,
      duration: Math.round(duration),
      updatesPerSecond: Math.round(updatesPerSecond),
      bytesPerSecond: Math.round(bytesPerSecond),
      totalKb: Math.round(this.totalBytes / 1024)
    };
  }

  reset() {
    this.updates = 0;
    this.startTime = 0;
    this.totalBytes = 0;
  }
}
