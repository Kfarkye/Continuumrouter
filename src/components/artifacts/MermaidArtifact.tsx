import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Artifact, ArtifactDisplayMode } from '../../types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MermaidArtifactProps {
  artifact: Artifact;
  displayMode: ArtifactDisplayMode;
}

export const MermaidArtifact: React.FC<MermaidArtifactProps> = ({ artifact, displayMode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });
  }, []);

  useEffect(() => {
    if (displayMode === 'code') return;

    const renderDiagram = async () => {
      try {
        setError(null);
        const id = `mermaid-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, artifact.content);
        setSvg(renderedSvg);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [artifact.content, artifact.updated_at, displayMode]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.3));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const renderPreview = () => (
    <div className="relative w-full h-full bg-zinc-900 overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 bg-black/60 backdrop-blur-sm rounded-lg p-1 border border-white/10">
        <button
          onClick={handleZoomIn}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={handleResetView}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Diagram Container */}
      <div
        ref={containerRef}
        className={`w-full h-full flex items-center justify-center ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {error ? (
          <div className="text-center p-6">
            <p className="text-red-500 text-sm font-medium mb-2">Diagram Error</p>
            <p className="text-gray-400 text-xs">{error}</p>
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {/* Zoom Indicator */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-400 bg-black/60 backdrop-blur-sm px-2 py-1 rounded border border-white/10">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );

  const renderCode = () => (
    <div className="w-full h-full overflow-auto bg-[#1e1e1e]">
      <SyntaxHighlighter
        language="mermaid"
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.875rem',
          lineHeight: '1.5',
        }}
        showLineNumbers
        wrapLongLines
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  );

  if (displayMode === 'preview') {
    return renderPreview();
  }

  if (displayMode === 'code') {
    return renderCode();
  }

  // Split view
  return (
    <div className="flex h-full">
      <div className="w-1/2 border-r border-white/10 overflow-auto">
        {renderCode()}
      </div>
      <div className="w-1/2 overflow-auto">
        {renderPreview()}
      </div>
    </div>
  );
};
