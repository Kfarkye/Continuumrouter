/* src/components/LivePreviewSandbox.tsx */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Maximize2, RefreshCw, Code as CodeIcon, Minimize2, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
// ENHANCEMENT: Import CodeBlock for enhanced code view
import { CodeBlock } from './CodeBlock'; 

interface LivePreviewSandboxProps {
  code: string;
  className?: string;
}

// ENHANCEMENT: Simple debounce hook
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
      const handler = setTimeout(() => setDebouncedValue(value), delay);
      return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// ENHANCEMENT: Helper script to inject into the iframe for basic error reporting
const ERROR_CATCHING_SCRIPT = `
<script>
  window.addEventListener('error', function(e) {
    const errorContainer = document.createElement('div');
    errorContainer.style.position = 'fixed';
    errorContainer.style.bottom = '0';
    errorContainer.style.left = '0';
    errorContainer.style.right = '0';
    errorContainer.style.padding = '12px';
    errorContainer.style.backgroundColor = 'rgba(185, 28, 28, 0.9)'; // bg-red-700/90
    errorContainer.style.color = '#ffffff';
    errorContainer.style.fontFamily = 'monospace';
    errorContainer.style.fontSize = '13px';
    errorContainer.style.zIndex = '100000';
    errorContainer.style.whiteSpace = 'pre-wrap';
    errorContainer.style.boxShadow = '0 -2px 10px rgba(0,0,0,0.5)';
    errorContainer.innerText = 'Sandbox Runtime Error: ' + e.message + ' (' + e.lineno + ':' + e.colno + ')';
    
    // Remove previous errors
    const existingError = document.getElementById('sandbox-error-overlay');
    if (existingError) existingError.remove();
    errorContainer.id = 'sandbox-error-overlay';

    if (document.body) {
        document.body.appendChild(errorContainer);
    }
  });
</script>
`;


export const LivePreviewSandbox: React.FC<LivePreviewSandboxProps> = ({ code, className }) => {
  const [key, setKey] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce the code input (250ms delay)
  const debouncedCode = useDebounce(code, 250);

  // Process the debounced code to inject the error-catching script
  const processedCode = useMemo(() => {
    const codeToProcess = debouncedCode;

    // If the code is a complete HTML document, inject the script intelligently.
    if (codeToProcess.match(/(<!DOCTYPE html>|<html>)/i)) {
        // Inject before the closing body or html tag if they exist
        if (codeToProcess.match(/(<\/body>|<\/html>)/i)) {
            return codeToProcess.replace(/(<\/body>|<\/html>)/i, `${ERROR_CATCHING_SCRIPT}$1`);
        }
        // If no closing tags found in "complete" doc, append script.
        return codeToProcess + ERROR_CATCHING_SCRIPT;
    }
    
    // If it's just a snippet, wrap it in a basic HTML structure.
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Preview Snippet</title>
            <style>body { margin: 0; padding: 1rem; /* Add padding for snippets */ }</style>
        </head>
        <body>
            ${codeToProcess}
            ${ERROR_CATCHING_SCRIPT}
        </body>
        </html>
    `;

  }, [debouncedCode]);


  // The iframe source depends on the processed code and the refresh key.
  const iframeSrcDoc = useMemo(() => processedCode, [processedCode, key]);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setKey((prevKey) => prevKey + 1);
  }, []);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  const toggleShowCode = useCallback(() => {
    setShowCode((prev) => !prev);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Reset loading state when the debounced code changes
  useEffect(() => {
    setIsLoading(true);
  }, [debouncedCode]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  // Accessibility enhancement: Reusable ToolbarButton component
  const ToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }> = ({ children, active, ...props }) => (
    <button
        {...props}
        className={cn(
            "p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            active && "text-white bg-white/10",
            props.className
        )}
    >
        {children}
    </button>
  );

  return (
    <div
      className={cn(
        'relative my-4 rounded-xl overflow-hidden shadow-xl border border-white/10 bg-zinc-900/80 transition-all duration-300',
        isFullScreen
            ? 'fixed inset-0 z-50 m-0 rounded-none h-full w-full'
            : 'h-96',
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/95 border-b border-white/10 sticky top-0 z-10">
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            Live Preview Sandbox
            <span title="Runtime errors in the preview are captured." className='text-gray-500 hover:text-yellow-600 transition-colors cursor-help'>
                <AlertTriangle size={14} />
            </span>
        </span>

        <div className="flex items-center gap-2">
        <ToolbarButton
            onClick={toggleShowCode}
            active={showCode}
            title="Toggle Code View"
            aria-label="Toggle Code View"
          >
            <CodeIcon size={18} />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleRefresh}
            title="Refresh Preview"
            aria-label="Refresh Preview"
          >
            {/* Show spin animation on the refresh button itself if loading */}
            <RefreshCw size={18} className={(isLoading && !showCode) ? "animate-spin" : ""} />
          </ToolbarButton>
          <ToolbarButton
            onClick={toggleFullScreen}
            title={isFullScreen ? "Exit Full Screen (Esc)" : "Enter Full Screen"}
            aria-label={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          >
            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </ToolbarButton>
        </div>
      </div>

      {/* Content Area (Height minus the header: 41px) */}
      <div className="h-[calc(100%-41px)] bg-white relative">
        {showCode ? (
           // ENHANCEMENT: Use CodeBlock instead of textarea
           <div className='h-full'>
             <CodeBlock
                // Use the original (non-debounced) code for the viewer so it updates instantly
                value={code}
                language="html" // Assuming HTML for sandbox source
                height="100%" // Force CodeBlock to fill the container
                collapsible={false} 
                // Remove margins/rounding/shadows/borders to fit flush
                className='m-0 rounded-none shadow-none border-0 bg-zinc-950'
              />
           </div>
        ) : (
            <>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                    <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                </div>
            )}
            
            <iframe
                key={key}
                srcDoc={iframeSrcDoc}
                // Hide iframe until loaded
                className={cn("w-full h-full border-0 transition-opacity duration-300", isLoading ? "opacity-0" : "opacity-100")}
                title="Live Code Preview"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
                onLoad={handleIframeLoad}
                onError={() => setIsLoading(false)} // Handle potential iframe blocking errors
            />
          </>
        )}
      </div>
    </div>
  );
};