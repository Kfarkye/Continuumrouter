/**
 * ChatErrorBoundary
 *
 * Production-grade error boundary with:
 * - Retry logic
 * - User-friendly error messages
 * - Error reporting
 * - Graceful degradation
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Chat Error Boundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Here you would send to error reporting service
    // e.g., Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleReset = () => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));

    this.props.onReset?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const canRetry = this.state.retryCount < MAX_RETRIES;
      const errorMessage = this.state.error?.message || 'An unexpected error occurred';

      return (
        <div className="flex h-full w-full items-center justify-center p-8 antialiased">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            {/* Glass Card */}
            <div className="rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-red-500/30 shadow-2xl p-8">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="h-8 w-8 text-red-400" strokeWidth={1.5} />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-center text-xl font-semibold text-white mb-2">
                {this.props.fallbackTitle || 'Something went wrong'}
              </h2>

              {/* Error Message */}
              <p className="text-center text-sm text-zinc-400 mb-6">
                {errorMessage}
              </p>

              {/* Retry Info */}
              {this.state.retryCount > 0 && (
                <p className="text-center text-xs text-zinc-500 mb-6">
                  Retry attempt {this.state.retryCount} of {MAX_RETRIES}
                </p>
              )}

              {/* Actions */}
              <div className="space-y-3">
                {canRetry && (
                  <button
                    onClick={this.handleReset}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors duration-200"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Try Again
                  </button>
                )}

                <button
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl border border-white/10 transition-colors duration-200"
                >
                  <Home className="h-4 w-4" />
                  Reload Page
                </button>
              </div>

              {/* Technical Details (Collapsible) */}
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="mt-6 p-4 bg-black/40 rounded-lg border border-white/5">
                  <summary className="text-xs font-medium text-zinc-400 cursor-pointer">
                    Technical Details
                  </summary>
                  <pre className="mt-3 text-xs text-zinc-500 overflow-auto max-h-40">
                    {this.state.error?.stack}
                  </pre>
                  <pre className="mt-2 text-xs text-zinc-500 overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Async Error Boundary for handling promise rejections
 */
export function withAsyncErrorHandling<T extends (...args: any[]) => Promise<any>>(
  asyncFn: T,
  onError?: (error: Error) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      console.error('Async operation failed:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }) as T;
}
