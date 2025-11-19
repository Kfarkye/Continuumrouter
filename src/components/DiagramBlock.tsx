/**
 * DiagramBlock Component - Mermaid Diagram Renderer
 *
 * Automatically renders Mermaid.js diagrams with error handling and fallback to CodeBlock.
 * Supports all Mermaid diagram types: flowchart, sequence, ERD, class, state, Gantt, etc.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Spinner } from './Spinner';
import mermaid from 'mermaid';
import { AlertTriangle, Download, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';

/* ──────────────────────────────── Types ──────────────────────────────── */

export interface DiagramBlockProps {
  value: string;
  className?: string;
}

interface RenderState {
  status: 'idle' | 'rendering' | 'success' | 'error';
  svg?: string;
  error?: string;
}

/* ──────────────────────────────── Configuration ──────────────────────────────── */

// Initialize mermaid with dark theme matching our design system
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#18181b',
    primaryColor: '#3b82f6',
    primaryTextColor: '#e5e7eb',
    primaryBorderColor: '#60a5fa',
    lineColor: '#6b7280',
    secondaryColor: '#8b5cf6',
    tertiaryColor: '#10b981',
    noteBkgColor: '#27272a',
    noteTextColor: '#e5e7eb',
    noteBorderColor: '#52525b',
  },
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  logLevel: 'error',
  securityLevel: 'strict',
});

/* ──────────────────────────────── Component ──────────────────────────────── */

export const DiagramBlock: React.FC<DiagramBlockProps> = ({ value, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderState, setRenderState] = useState<RenderState>({ status: 'idle' });
  const [zoom, setZoom] = useState<number>(1);
  const [showRawCode, setShowRawCode] = useState<boolean>(false);
  const renderIdRef = useRef<number>(0);

  // Render diagram
  useEffect(() => {
    const currentRenderId = ++renderIdRef.current;

    const renderDiagram = async () => {
      if (!value.trim()) {
        setRenderState({ status: 'error', error: 'Empty diagram content' });
        return;
      }

      setRenderState({ status: 'rendering' });

      try {
        // Generate unique ID for this render
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Validate and render
        const { svg } = await mermaid.render(id, value);

        // Only update if this is still the current render
        if (currentRenderId === renderIdRef.current) {
          setRenderState({ status: 'success', svg });
        }
      } catch (err: any) {
        // Only update if this is still the current render
        if (currentRenderId === renderIdRef.current) {
          const errorMessage = err?.message || String(err);
          console.error('Mermaid render error:', errorMessage);
          setRenderState({
            status: 'error',
            error: errorMessage
          });
        }
      }
    };

    renderDiagram();
  }, [value]);

  // Download diagram as SVG
  const downloadSvg = useCallback(() => {
    if (renderState.status !== 'success' || !renderState.svg) return;

    try {
      const blob = new Blob([renderState.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagram-${Date.now()}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download diagram:', err);
    }
  }, [renderState]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.2, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.2, 0.5));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // Toggle between rendered view and raw code
  const toggleRawCode = useCallback(() => {
    setShowRawCode((prev) => !prev);
  }, []);

  // Render error state - fallback to CodeBlock
  if (renderState.status === 'error') {
    return (
      <div className={cn('my-4', className)}>
        <div className="mb-2 px-3 py-2 bg-red-900/20 border border-red-600/30 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-300 font-semibold mb-1">
              Failed to render Mermaid diagram
            </p>
            <p className="text-xs text-red-300/80">{renderState.error}</p>
          </div>
        </div>
        <CodeBlock value={value} language="mermaid" showLineNumbers={false} />
      </div>
    );
  }

  // Show raw code view
  if (showRawCode) {
    return (
      <div className={cn('my-4', className)}>
        <div className="mb-2 flex items-center justify-between px-3 py-2 bg-blue-900/20 border border-blue-600/30 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-300 font-semibold">Mermaid Source Code</span>
          </div>
          <button
            onClick={toggleRawCode}
            className="px-2 py-1 text-xs text-blue-300 hover:text-blue-200 hover:bg-blue-900/30 rounded transition-colors"
          >
            Show Diagram
          </button>
        </div>
        <CodeBlock value={value} language="mermaid" showLineNumbers={true} />
      </div>
    );
  }

  // Render loading state
  if (renderState.status === 'rendering') {
    return (
      <div className={cn('my-4 p-8 rounded-xl bg-zinc-900/60 border border-white/5', className)}>
        <div className="flex items-center justify-center gap-3">
          <Spinner size="md" color="blue" />
          <span className="text-sm text-white/70">Rendering diagram...</span>
        </div>
      </div>
    );
  }

  // Render success state - show diagram
  return (
    <div
      className={cn(
        'group relative my-4 rounded-xl overflow-hidden bg-zinc-900/80 border border-white/10 shadow-lg hover:shadow-xl transition-all duration-300',
        className
      )}
    >
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/95 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200">Mermaid Diagram</span>
          <span className="text-xs text-gray-400">({Math.round(zoom * 100)}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-1 text-xs rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Reset zoom"
          >
            Reset
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* View source button */}
          <button
            onClick={toggleRawCode}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="View source code"
          >
            <Maximize2 size={16} />
          </button>

          {/* Download button */}
          <button
            onClick={downloadSvg}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Download as SVG"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Diagram container */}
      <div
        ref={containerRef}
        className="relative overflow-auto custom-scrollbar bg-zinc-900/40 p-8"
        style={{
          maxHeight: '600px',
        }}
      >
        <div
          className="inline-block transition-transform duration-200"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          dangerouslySetInnerHTML={{ __html: renderState.svg || '' }}
        />
      </div>
    </div>
  );
};

DiagramBlock.displayName = 'DiagramBlock';
