import React, { useState, useMemo } from 'react';
import { Artifact, ArtifactDisplayMode } from '../../types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChevronDown, ChevronRight, Globe, Lock } from 'lucide-react';
import yaml from 'js-yaml';

interface OpenAPIArtifactProps {
  artifact: Artifact;
  displayMode: ArtifactDisplayMode;
}

interface OpenAPISpec {
  openapi?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, any>;
  components?: Record<string, any>;
}

export const OpenAPIArtifact: React.FC<OpenAPIArtifactProps> = ({ artifact, displayMode }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const spec = useMemo<OpenAPISpec | null>(() => {
    try {
      // Try parsing as YAML first, then JSON
      return yaml.load(artifact.content) as OpenAPISpec;
    } catch {
      try {
        return JSON.parse(artifact.content) as OpenAPISpec;
      } catch {
        console.error('Failed to parse OpenAPI spec');
        return null;
      }
    }
  }, [artifact.content]);

  const togglePath = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const getMethodColor = (method: string): string => {
    const colors: Record<string, string> = {
      get: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      post: 'text-green-400 bg-green-500/10 border-green-500/30',
      put: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
      patch: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
      delete: 'text-red-400 bg-red-500/10 border-red-500/30',
    };
    return colors[method.toLowerCase()] || 'text-gray-400 bg-gray-500/10 border-gray-500/30';
  };

  const renderPreview = () => {
    if (!spec) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-6">
            <p className="text-red-500 text-sm font-medium mb-2">Parse Error</p>
            <p className="text-gray-400 text-xs">Invalid OpenAPI specification</p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full overflow-auto bg-zinc-950 text-white">
        <div className="max-w-5xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8 pb-6 border-b border-white/10">
            <h1 className="text-3xl font-bold mb-2">{spec.info?.title || 'API Documentation'}</h1>
            {spec.info?.description && (
              <p className="text-gray-400 mb-3">{spec.info.description}</p>
            )}
            {spec.info?.version && (
              <span className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full text-sm">
                v{spec.info.version}
              </span>
            )}
          </div>

          {/* Servers */}
          {spec.servers && spec.servers.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Servers
              </h2>
              <div className="space-y-2">
                {spec.servers.map((server, idx) => (
                  <div key={idx} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <code className="text-blue-400 text-sm">{server.url}</code>
                    {server.description && (
                      <p className="text-gray-400 text-xs mt-1">{server.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Paths */}
          {spec.paths && Object.keys(spec.paths).length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Endpoints</h2>
              <div className="space-y-3">
                {Object.entries(spec.paths).map(([path, methods]) => (
                  <div key={path} className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
                    {Object.entries(methods as Record<string, any>).map(([method, details]) => {
                      if (typeof details !== 'object') return null;
                      const isExpanded = expandedPaths.has(`${method}-${path}`);

                      return (
                        <div key={method} className="border-b border-white/10 last:border-b-0">
                          <button
                            onClick={() => togglePath(`${method}-${path}`)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <span
                              className={`px-2 py-1 text-xs font-bold uppercase rounded border ${getMethodColor(method)}`}
                            >
                              {method}
                            </span>
                            <code className="text-sm text-gray-300 flex-1">{path}</code>
                            {details.security && (
                              <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3">
                              {details.summary && (
                                <p className="text-sm text-gray-300">{details.summary}</p>
                              )}
                              {details.description && (
                                <p className="text-xs text-gray-400">{details.description}</p>
                              )}

                              {details.parameters && details.parameters.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Parameters</h4>
                                  <div className="space-y-2">
                                    {details.parameters.map((param: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-2 text-xs">
                                        <code className="text-blue-400">{param.name}</code>
                                        <span className="text-gray-500">({param.in})</span>
                                        {param.required && (
                                          <span className="text-red-400">*</span>
                                        )}
                                        {param.description && (
                                          <span className="text-gray-400">{param.description}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.responses && (
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Responses</h4>
                                  <div className="space-y-1">
                                    {Object.entries(details.responses).map(([code, response]: [string, any]) => (
                                      <div key={code} className="flex items-start gap-2 text-xs">
                                        <span className={`font-mono ${code.startsWith('2') ? 'text-green-400' : code.startsWith('4') ? 'text-yellow-400' : 'text-red-400'}`}>
                                          {code}
                                        </span>
                                        {response.description && (
                                          <span className="text-gray-400">{response.description}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCode = () => (
    <div className="w-full h-full overflow-auto bg-[#1e1e1e]">
      <SyntaxHighlighter
        language="yaml"
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
