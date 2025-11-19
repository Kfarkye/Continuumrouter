/**
 * Preview Controls Component with Integrated Console
 *
 * Provides a toolbar for managing HTML previews including:
 * - Refresh preview
 * - Copy source code
 * - Open in new tab (fullscreen)
 * - Toggle console panel
 * - Clear console logs
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RefreshCw, Copy, Check, Terminal, Maximize, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ConsoleLog {
  id: number | string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: Date;
}

interface PreviewControlsProps {
  onRefresh: () => void;
  srcDoc: string;
  consoleLogs: ConsoleLog[];
  isConsoleOpen: boolean;
  onToggleConsole: () => void;
  onClearLogs: () => void;
}

export const PreviewControls: React.FC<PreviewControlsProps> = ({
  onRefresh,
  srcDoc,
  consoleLogs,
  isConsoleOpen,
  onToggleConsole,
  onClearLogs,
}) => {
  const [copied, setCopied] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(srcDoc);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy preview code:', err);
    }
  }, [srcDoc]);

  // Secure way to handle fullscreen for sandboxed content: open in a new tab
  const handleFullscreen = useCallback(() => {
    const blob = new Blob([srcDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      // Clean up the blob URL after the new window loads (or shortly after opening)
      newWindow.onload = () => URL.revokeObjectURL(url);
      setTimeout(() => URL.revokeObjectURL(url), 10000); // Fallback cleanup
    }
  }, [srcDoc]);

  const errorCount = consoleLogs.filter((m) => m.level === 'error').length;

  // Auto-scroll console to bottom when new logs arrive
  useEffect(() => {
    if (isConsoleOpen && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, isConsoleOpen]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400 bg-red-900/30 border-red-800';
      case 'warn':
        return 'text-yellow-400 bg-yellow-900/30 border-yellow-800';
      case 'info':
        return 'text-blue-400 border-zinc-800';
      default:
        return 'text-white/90 border-zinc-800';
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/95 border-b border-white/10 text-white backdrop-blur-sm">
        <span className="text-sm font-semibold">Live Preview Sandbox</span>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleConsole}
            className={cn(
              'flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-white/10 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isConsoleOpen ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white',
              errorCount > 0 && !isConsoleOpen && 'text-red-400 hover:text-red-300'
            )}
            title="Toggle Console"
            aria-expanded={isConsoleOpen}
            aria-label="Toggle console panel"
          >
            <Terminal className="w-4 h-4" />
            {consoleLogs.length > 0 && (
              <span
                className={cn(
                  'text-xs ml-1 px-1.5 rounded-full',
                  errorCount > 0 ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                )}
              >
                {consoleLogs.length}
              </span>
            )}
          </button>

          <button
            onClick={onRefresh}
            className="p-1.5 rounded-md text-gray-400 transition-colors hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Refresh Preview"
            aria-label="Refresh preview"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleCopy}
            className={cn(
              'p-1.5 rounded-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              copied ? 'text-green-400' : 'text-gray-400 hover:text-white'
            )}
            title="Copy Combined Source Code"
            aria-label="Copy source code"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded-md text-gray-400 transition-colors hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Open in New Tab (Fullscreen)"
            aria-label="Open in new tab"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Console Panel */}
      {isConsoleOpen && (
        <div className="h-48 bg-zinc-950 overflow-y-auto font-mono text-xs custom-scrollbar">
          <div className="sticky top-0 bg-zinc-950/90 backdrop-blur-sm px-4 py-2 flex justify-between items-center border-b border-white/10 z-10">
            <span className="text-white/70">Console Output</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClearLogs}
                className="text-xs text-white/50 hover:text-white transition-colors px-2 py-1 hover:bg-white/10 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Clear console logs"
              >
                Clear Logs
              </button>
              <button
                onClick={onToggleConsole}
                className="text-white/50 hover:text-white transition-colors p-1 hover:bg-white/10 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close console"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-2">
            {consoleLogs.length === 0 ? (
              <p className="text-white/50 italic p-4 text-center">No console output yet.</p>
            ) : (
              consoleLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 border-b last:border-b-0 whitespace-pre-wrap break-words ${getLogColor(
                    log.level
                  )}`}
                >
                  <span className="mr-2 text-white/50">[{log.timestamp.toLocaleTimeString()}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </>
  );
};
