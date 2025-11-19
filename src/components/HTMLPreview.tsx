/**
 * HTML Preview Component with Strict Sandboxing
 *
 * Renders HTML/CSS/JS content in a strictly sandboxed iframe for secure execution.
 * Features include:
 * - Strict sandbox security (NO allow-same-origin)
 * - Console capture via postMessage
 * - Refresh functionality
 * - Error boundary protection
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PreviewControls, ConsoleLog } from './PreviewControls';
import { PREVIEW_CONFIG } from '../config/previewConfig';

interface HTMLPreviewProps {
  srcDoc: string;
  title?: string;
}

/**
 * Error Boundary Component for React structural errors in the preview system
 */
class IframeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught in IframeErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-96 bg-red-900/20 flex flex-col items-center justify-center text-white p-4">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
          <h3 className="font-bold">Preview Component Error</h3>
          <p className="text-sm text-gray-300">
            An unexpected error occurred in the preview component structure.
          </p>
          <p className="text-xs mt-2 text-red-300">{this.state.errorMessage}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Main HTML Preview Component
 *
 * Security: The iframe is sandboxed with these critical restrictions:
 * - allow-scripts: Allows JavaScript execution (required for interactive previews)
 * - allow-modals: Allows alert/confirm/prompt
 * - allow-popups: Allows links to open new windows (e.g., target="_blank")
 * - NO allow-same-origin: CRITICAL - prevents access to parent origin/storage
 */
export const HTMLPreview: React.FC<HTMLPreviewProps> = ({ srcDoc, title = 'Live Preview' }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  // Use a key to force React to unmount and remount the iframe for a clean refresh
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setConsoleLogs([]);
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Effect to trigger refresh when srcDoc changes externally
  useEffect(() => {
    handleRefresh();
  }, [srcDoc, handleRefresh]);

  // Listener for messages from the iframe (console logs/errors)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security Note: Since the iframe is sandboxed and uses srcDoc, its origin is 'null'.
      // We rely heavily on the sandbox restrictions (no allow-same-origin) and the message type check.

      const { data } = event;
      if (data && data.type === 'iframe_console') {
        const { level, message } = data.payload;

        // Enforce maximum console message limit
        setConsoleLogs((prev) => {
          const newLogs = [
            ...prev,
            {
              id: Date.now() + Math.random(),
              level: level,
              message: message,
              timestamp: new Date(),
            },
          ];

          // Keep only the most recent messages within the limit
          if (newLogs.length > PREVIEW_CONFIG.CONSOLE.MAX_MESSAGES) {
            return newLogs.slice(-PREVIEW_CONFIG.CONSOLE.MAX_MESSAGES);
          }

          return newLogs;
        });

        // Auto-open console if an error occurs and auto-open is enabled
        if (level === 'error' && !isConsoleOpen && PREVIEW_CONFIG.CONSOLE.AUTO_OPEN_ON_ERROR) {
          setIsConsoleOpen(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isConsoleOpen]);

  return (
    <div className="flex flex-col w-full border border-white/10 rounded-xl overflow-hidden shadow-xl bg-zinc-900">
      <PreviewControls
        onRefresh={handleRefresh}
        srcDoc={srcDoc}
        consoleLogs={consoleLogs}
        isConsoleOpen={isConsoleOpen}
        onToggleConsole={() => setIsConsoleOpen((prev) => !prev)}
        onClearLogs={() => setConsoleLogs([])}
      />

      {/* The preview area itself. Height is fixed but could be made dynamic/resizable. */}
      <div className="flex-1 h-96 bg-white">
        <IframeErrorBoundary>
          <iframe
            key={refreshKey}
            ref={iframeRef}
            srcDoc={srcDoc}
            title={title}
            className="w-full h-full border-0"
            /**
             * SECURITY: Sandboxing the iframe.
             * - allow-scripts: Allows JavaScript execution.
             * - allow-modals: Allows alert/confirm/prompt.
             * - allow-popups: Allows links to open new windows (e.g., target="_blank").
             * - CRITICAL: DO NOT USE allow-same-origin. This prevents the iframe from
             *   accessing the parent's origin/storage/cookies/localStorage.
             */
            sandbox={PREVIEW_CONFIG.SANDBOX_ATTRIBUTES}
          />
        </IframeErrorBoundary>
      </div>
    </div>
  );
};
