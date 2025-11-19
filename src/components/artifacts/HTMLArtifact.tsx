import React, { useRef, useEffect, useState } from 'react';
import { Artifact, ArtifactDisplayMode } from '../../types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface HTMLArtifactProps {
  artifact: Artifact;
  displayMode: ArtifactDisplayMode;
}

export const HTMLArtifact: React.FC<HTMLArtifactProps> = ({ artifact, displayMode }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);

  useEffect(() => {
    if (displayMode === 'code') return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      setIframeError(null);

      // Create sandbox content
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        setIframeError('Unable to access iframe document');
        return;
      }

      doc.open();
      doc.write(artifact.content);
      doc.close();
    } catch (error) {
      console.error('Failed to render HTML artifact:', error);
      setIframeError(error instanceof Error ? error.message : 'Failed to render preview');
    }
  }, [artifact.content, artifact.updated_at, displayMode]);

  const renderPreview = () => (
    <div className="relative w-full h-full bg-white">
      {iframeError ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-6">
            <p className="text-red-500 text-sm font-medium mb-2">Preview Error</p>
            <p className="text-gray-600 text-xs">{iframeError}</p>
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title={artifact.title}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
        />
      )}
    </div>
  );

  const renderCode = () => (
    <div className="w-full h-full overflow-auto bg-[#1e1e1e]">
      <SyntaxHighlighter
        language="html"
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
