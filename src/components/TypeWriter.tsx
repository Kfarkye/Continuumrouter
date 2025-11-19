// TypeWriter.tsx
import React, { useEffect, useReducer, useRef } from 'react';

/**
 * Phase of the typewriter finite state machine.
 */
type TypewriterPhase = 'idle' | 'typing' | 'pausing' | 'deleting' | 'finished';

/**
 * Reason for being in a pausing phase.
 */
type PauseReason = 'beforeDelete' | 'beforeType' | null;

/**
 * Internal state for the typewriter reducer.
 */
interface TypewriterState {
  phase: TypewriterPhase;
  currentLineIndex: number;
  displayedLines: string[];
  pauseReason: PauseReason;
}

/**
 * Action type for the typewriter reducer.
 */
type TypewriterAction =
  | { type: 'TICK'; payload: { lines: string[]; loop: boolean } }
  | { type: 'RESET'; payload: { lines: string[] } };

/**
 * Configuration options for the `useTypewriter` hook.
 */
export interface UseTypewriterOptions {
  /**
   * Lines of text to animate in sequence.
   */
  lines: string[];

  /**
   * Delay in milliseconds between typed characters.
   * Defaults to 50ms.
   */
  typingSpeed?: number;

  /**
   * Delay in milliseconds between deleted characters.
   * Defaults to 30ms.
   */
  deleteSpeed?: number;

  /**
   * Pause in milliseconds after the last line is fully typed
   * before deletion starts.
   * Defaults to 2000ms.
   */
  pauseBeforeDelete?: number;

  /**
   * Pause in milliseconds before a new typing cycle starts
   * when `loop` is enabled.
   * Defaults to 500ms.
   */
  pauseBeforeType?: number;

  /**
   * Whether to loop the animation after all lines have been
   * typed and deleted.
   * Defaults to `true`.
   */
  loop?: boolean;

  /**
   * Callback invoked once when the animation finishes and
   * `loop` is `false`.
   */
  onComplete?: () => void;
}

/**
 * Result returned from the `useTypewriter` hook.
 */
export interface UseTypewriterResult {
  /**
   * Current text displayed for each line.
   * Length always matches `lines.length`.
   */
  displayedLines: string[];

  /**
   * Index of the line currently being typed or deleted.
   */
  currentLineIndex: number;

  /**
   * Current phase of the internal state machine.
   */
  phase: TypewriterPhase;
}

/**
 * Create the initial typewriter state from an array of lines.
 */
function createInitialState(lines: string[]): TypewriterState {
  return {
    phase: lines.length === 0 ? 'idle' : 'typing',
    currentLineIndex: 0,
    displayedLines: lines.map(() => ''),
    pauseReason: null,
  };
}

/**
 * Reducer implementing the typewriter finite state machine.
 * All character-level mutations and phase transitions happen here.
 */
function typewriterReducer(
  state: TypewriterState,
  action: TypewriterAction
): TypewriterState {
  switch (action.type) {
    case 'RESET': {
      const { lines } = action.payload;
      return createInitialState(lines);
    }

    case 'TICK': {
      const { lines, loop } = action.payload;

      if (lines.length === 0) {
        return {
          phase: 'idle',
          currentLineIndex: 0,
          displayedLines: [],
          pauseReason: null,
        };
      }

      const lastIndex = lines.length - 1;
      const currentIndex = Math.min(state.currentLineIndex, lastIndex);

      // Normalize displayedLines length to match lines length.
      const safeDisplayedLines =
        state.displayedLines.length === lines.length
          ? state.displayedLines
          : lines.map((_, idx) => state.displayedLines[idx] ?? '');

      const currentFullLine = lines[currentIndex] ?? '';
      const currentDisplayed = safeDisplayedLines[currentIndex] ?? '';

      if (state.phase === 'typing') {
        // Still typing current line.
        if (currentDisplayed.length < currentFullLine.length) {
          const updatedLines = [...safeDisplayedLines];
          updatedLines[currentIndex] = currentFullLine.slice(
            0,
            currentDisplayed.length + 1
          );
          return {
            ...state,
            displayedLines: updatedLines,
            currentLineIndex: currentIndex,
          };
        }

        // Finished typing current line.
        if (currentIndex < lastIndex) {
          // Move to next line and continue typing.
          return {
            ...state,
            currentLineIndex: currentIndex + 1,
            phase: 'typing',
            displayedLines: safeDisplayedLines,
          };
        }

        // Last line completed: pause before deletion.
        return {
          ...state,
          phase: 'pausing',
          pauseReason: 'beforeDelete',
          displayedLines: safeDisplayedLines,
          currentLineIndex: currentIndex,
        };
      }

      if (state.phase === 'deleting') {
        // Still deleting characters from current line.
        if (currentDisplayed.length > 0) {
          const updatedLines = [...safeDisplayedLines];
          updatedLines[currentIndex] = currentDisplayed.slice(
            0,
            currentDisplayed.length - 1
          );
          return {
            ...state,
            displayedLines: updatedLines,
            currentLineIndex: currentIndex,
          };
        }

        // Current line is empty. Move up or finish cycle.
        if (currentIndex > 0) {
          return {
            ...state,
            currentLineIndex: currentIndex - 1,
            phase: 'deleting',
            displayedLines: safeDisplayedLines,
          };
        }

        // First line empty: entire block deleted.
        if (loop) {
          // Pause before starting a new typing cycle.
          return {
            ...state,
            phase: 'pausing',
            pauseReason: 'beforeType',
            displayedLines: safeDisplayedLines,
            currentLineIndex: 0,
          };
        }

        // Non-looping: mark as finished.
        return {
          ...state,
          phase: 'finished',
          pauseReason: null,
          displayedLines: safeDisplayedLines,
          currentLineIndex: 0,
        };
      }

      if (state.phase === 'pausing') {
        // Transition out of pause based on reason.
        if (state.pauseReason === 'beforeDelete') {
          // Start deleting from the last line.
          return {
            ...state,
            phase: 'deleting',
            pauseReason: null,
            currentLineIndex: lastIndex,
            displayedLines: safeDisplayedLines,
          };
        }
        if (state.pauseReason === 'beforeType') {
          // Restart typing from scratch.
          return {
            phase: 'typing',
            pauseReason: null,
            currentLineIndex: 0,
            displayedLines: lines.map(() => ''),
          };
        }
        return state;
      }

      // idle / finished: no-op on tick.
      return state;
    }

    default:
      return state;
  }
}

/**
 * Hook that implements a multi-line typewriter effect using
 * a reducer-driven finite state machine.
 *
 * It encapsulates all timing and state transition logic and
 * exposes only the rendered lines and the active line index.
 */
export function useTypewriter(options: UseTypewriterOptions): UseTypewriterResult {
  const {
    lines,
    typingSpeed = 50,
    deleteSpeed = 30,
    pauseBeforeDelete = 2000,
    pauseBeforeType = 500,
    loop = true,
    onComplete,
  } = options;

  const [state, dispatch] = useReducer(
    typewriterReducer,
    lines,
    createInitialState
  );

  const linesRef = useRef<string[]>(lines);
  const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
  const hasCompletedRef = useRef(false);

  // Keep latest lines in a ref and reset animation when lines change.
  useEffect(() => {
    linesRef.current = lines;
    dispatch({ type: 'RESET', payload: { lines } });
  }, [lines]);

  // Keep latest onComplete callback in a ref.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Schedule ticks based on the current phase and configuration.
  // IMPORTANT: The entire `state` object must be in the dependency array.
  // This ensures the timer re-evaluates when state.displayedLines and state.currentLineIndex
  // change during typing and deleting phases, allowing the animation to proceed continuously.
  useEffect(() => {
    if (!linesRef.current.length) return;
    if (state.phase === 'idle' || state.phase === 'finished') return;

    let delay: number;

    if (state.phase === 'typing') {
      delay = typingSpeed;
    } else if (state.phase === 'deleting') {
      delay = deleteSpeed;
    } else if (state.phase === 'pausing') {
      delay =
        state.pauseReason === 'beforeDelete'
          ? pauseBeforeDelete
          : pauseBeforeType;
    } else {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dispatch({
        type: 'TICK',
        payload: {
          lines: linesRef.current,
          loop,
        },
      });
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    state,
    typingSpeed,
    deleteSpeed,
    pauseBeforeDelete,
    pauseBeforeType,
    loop,
  ]);

  // Fire onComplete exactly once per non-looping run.
  useEffect(() => {
    if (state.phase === 'finished' && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current?.();
    } else if (state.phase !== 'finished') {
      hasCompletedRef.current = false;
    }
  }, [state.phase]);

  return {
    displayedLines: state.displayedLines,
    currentLineIndex: state.currentLineIndex,
    phase: state.phase,
  };
}

/**
 * Props for the `TypeWriter` component.
 */
export interface TypeWriterProps extends UseTypewriterOptions {
  /**
   * Tailwind (or general CSS) color classes applied per line.
   * If fewer colors than lines are provided, the last color
   * is reused for remaining lines.
   *
   * Defaults to `['text-blue-400', 'text-white/60']`.
   */
  colors?: string[];

  /**
   * Whether to show a cursor on the active line.
   * Defaults to `true`.
   */
  showCursor?: boolean;

  /**
   * Optional custom cursor to render for the active line.
   * If omitted, a bar cursor is used for the first line and
   * a dot cursor for subsequent lines.
   */
  cursorChar?: React.ReactNode;

  /**
   * Optional additional className applied to the outer container.
   */
  className?: string;
}

/**
 * Presentational component that renders the lines produced by
 * `useTypewriter` with color and cursor styling.
 */
export const TypeWriter: React.FC<TypeWriterProps> = ({
  lines,
  colors = ['text-blue-400', 'text-white/60'],
  typingSpeed,
  deleteSpeed,
  pauseBeforeDelete,
  pauseBeforeType,
  loop,
  onComplete,
  showCursor = true,
  cursorChar = '',
  className = '',
}) => {
  const { displayedLines, currentLineIndex } = useTypewriter({
    lines,
    typingSpeed,
    deleteSpeed,
    pauseBeforeDelete,
    pauseBeforeType,
    loop,
    onComplete,
  });

  if (!lines.length) {
    return null;
  }

  return (
    <div
      className={`text-5xl font-bold leading-tight mb-3 h-48 flex flex-col justify-center ${className}`}
    >
      {displayedLines.map((text, index) => {
        const isActive = index === currentLineIndex;
        const isFirst = index === 0;
        const colorClass =
          colors[index] ??
          (colors.length > 0 ? colors[colors.length - 1] : '');

        const baseLineClass =
          'transition-opacity duration-200 flex items-center gap-4';
        const marginClass = isFirst ? 'mb-2' : '';

        return (
          <div
            key={index}
            className={`${colorClass} ${baseLineClass} ${marginClass}`.trim()}
          >
            <span>{text}</span>
            {showCursor && isActive && (
              cursorChar ? (
                <span className="inline-block ml-1">{cursorChar}</span>
              ) : isFirst ? (
                <span className="inline-block ml-1 w-1 h-12 bg-blue-400 animate-pulse" />
              ) : (
                <span className="inline-block ml-1 w-5 h-5 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />
              )
            )}
          </div>
        );
      })}
    </div>
  );
};
