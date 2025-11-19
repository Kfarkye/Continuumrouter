import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Maximize2, Minimize2, ChevronLeft, ChevronRight, Code2, Eye,
  Columns, Download, RotateCcw, Copy, Check
} from 'lucide-react';
import { useArtifacts } from '../contexts/ArtifactsContext';
import { ArtifactDisplayMode } from '../types';
import { HTMLArtifact } from './artifacts/HTMLArtifact';
import { MermaidArtifact } from './artifacts/MermaidArtifact';
import { OpenAPIArtifact } from './artifacts/OpenAPIArtifact';

export const ArtifactsPanel: React.FC = () => {
  const {
    currentArtifact,
    artifactHistory,
    isOpen,
    panelWidth,
    closeArtifact,
    navigateHistory,
    updateArtifact,
    setPanelWidth,
  } = useArtifacts();

  const [isResizing, setIsResizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  const currentIndex = currentArtifact
    ? artifactHistory.findIndex(a => a.id === currentArtifact.id)
    : -1;
  const canNavigatePrev = currentIndex < artifactHistory.length - 1;
  const canNavigateNext = currentIndex > 0;

  // Resize Handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setPanelWidth]);

  const handleToggleFullscreen = () => {
    if (!currentArtifact) return;
    updateArtifact({ is_fullscreen: !currentArtifact.is_fullscreen });
  };

  const handleDisplayModeChange = (mode: ArtifactDisplayMode) => {
    if (!currentArtifact) return;
    updateArtifact({ display_mode: mode });
  };

  const handleCopyCode = async () => {
    if (!currentArtifact) return;
    try {
      await navigator.clipboard.writeText(currentArtifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleDownload = () => {
    if (!currentArtifact) return;

    const extensions: Record<string, string> = {
      html: 'html',
      mermaid: 'mmd',
      openapi: 'yaml',
      react: 'tsx',
      javascript: 'js',
    };

    const ext = extensions[currentArtifact.artifact_type] || 'txt';
    const filename = `${currentArtifact.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;

    const blob = new Blob([currentArtifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    // Force re-render of artifact
    if (!currentArtifact) return;
    updateArtifact({ updated_at: new Date().toISOString() });
  };

  const renderArtifactContent = () => {
    if (!currentArtifact) return null;

    const props = {
      artifact: currentArtifact,
      displayMode: currentArtifact.display_mode,
    };

    switch (currentArtifact.artifact_type) {
      case 'html':
        return <HTMLArtifact {...props} />;
      case 'mermaid':
        return <MermaidArtifact {...props} />;
      case 'openapi':
        return <OpenAPIArtifact {...props} />;
      case 'react':
      case 'javascript':
        // For now, treat as code preview
        return <HTMLArtifact {...props} />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-400">
            Unsupported artifact type: {currentArtifact.artifact_type}
          </div>
        );
    }
  };

  if (!isOpen || !currentArtifact) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ x: '100%' }}
        animate={{
          x: 0,
          width: currentArtifact.is_fullscreen ? '100%' : panelWidth,
        }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`
          fixed right-0 top-0 h-screen
          bg-[#0a0a0a] border-l border-white/10
          z-40 flex flex-col
          ${isResizing ? 'select-none' : ''}
        `}
        style={{
          width: currentArtifact.is_fullscreen ? '100%' : panelWidth,
        }}
      >
        {/* Resize Handle */}
        {!currentArtifact.is_fullscreen && (
          <div
            ref={resizeHandleRef}
            onMouseDown={handleMouseDown}
            className={`
              absolute left-0 top-0 bottom-0 w-1
              cursor-col-resize hover:bg-blue-500/50
              transition-colors duration-150
              ${isResizing ? 'bg-blue-500' : 'bg-transparent'}
            `}
          />
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateHistory('prev')}
                disabled={!canNavigatePrev}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous artifact"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateHistory('next')}
                disabled={!canNavigateNext}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next artifact"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                {currentArtifact.title}
              </h2>
              <p className="text-xs text-gray-500 capitalize">
                {currentArtifact.artifact_type} • v{currentArtifact.version}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Display Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => handleDisplayModeChange('preview')}
                className={`
                  p-1.5 rounded transition-colors
                  ${currentArtifact.display_mode === 'preview'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-white'
                  }
                `}
                title="Preview only"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDisplayModeChange('code')}
                className={`
                  p-1.5 rounded transition-colors
                  ${currentArtifact.display_mode === 'code'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-white'
                  }
                `}
                title="Code only"
              >
                <Code2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDisplayModeChange('split')}
                className={`
                  p-1.5 rounded transition-colors
                  ${currentArtifact.display_mode === 'split'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-white'
                  }
                `}
                title="Split view"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-6 bg-white/10" />

            {/* Utility Actions */}
            <button
              onClick={handleCopyCode}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Copy code"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Refresh"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-white/10" />

            <button
              onClick={handleToggleFullscreen}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title={currentArtifact.is_fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {currentArtifact.is_fullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={closeArtifact}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {renderArtifactContent()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
