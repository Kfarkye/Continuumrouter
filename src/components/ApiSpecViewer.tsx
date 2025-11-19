/**
 * ApiSpecViewer Component - Interactive OpenAPI/Swagger Documentation
 *
 * Renders OpenAPI 3.x and Swagger 2.0 specifications as formatted, explorable API documentation.
 * Includes toggle to switch between rendered view and raw code view.
 *
 * Note: Uses a custom lightweight renderer instead of swagger-ui-react to avoid Vite build issues.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Code2, FileJson, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';
import yaml from 'js-yaml';

/* ──────────────────────────────── Types ──────────────────────────────── */

export interface ApiSpecViewerProps {
  spec: string;
  format: 'json' | 'yaml';
  className?: string;
}

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, Record<string, any>>;
  components?: any;
}

/* ──────────────────────────────── Component ──────────────────────────────── */

export const ApiSpecViewer: React.FC<ApiSpecViewerProps> = ({
  spec,
  format,
  className = '',
}) => {
  const [showRawCode, setShowRawCode] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Parse spec to object
  const specObject = useMemo<OpenAPISpec | null>(() => {
    try {
      if (format === 'json') {
        return JSON.parse(spec);
      } else {
        return yaml.load(spec) as OpenAPISpec;
      }
    } catch (err: any) {
      const errorMsg = `Failed to parse ${format.toUpperCase()}: ${err.message}`;
      setRenderError(errorMsg);
      return null;
    }
  }, [spec, format]);

  // Get spec version info
  const specInfo = useMemo(() => {
    if (!specObject) return null;

    const version = specObject.openapi || specObject.swagger;
    const title = specObject.info?.title || 'API Documentation';
    const apiVersion = specObject.info?.version || 'Unknown';
    const description = specObject.info?.description || '';

    return { version, title, apiVersion, description };
  }, [specObject]);

  const toggleView = useCallback(() => {
    setShowRawCode((prev) => !prev);
  }, []);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Render error state
  if (renderError) {
    return (
      <div className={cn('my-4', className)}>
        <div className="mb-2 px-3 py-2 bg-red-900/20 border border-red-600/30 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-300 font-semibold mb-1">
              Failed to render API specification
            </p>
            <p className="text-xs text-red-300/80">{renderError}</p>
          </div>
        </div>
        <CodeBlock value={spec} language={format} showLineNumbers={true} />
      </div>
    );
  }

  // Show raw code view
  if (showRawCode) {
    return (
      <div className={cn('my-4', className)}>
        <div className="mb-2 flex items-center justify-between px-3 py-2 bg-blue-900/20 border border-blue-600/30 rounded-lg">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-blue-300 font-semibold">
              {specInfo?.title || 'API Specification'} - Source Code
            </span>
            {specInfo?.version && (
              <span className="text-xs text-blue-300/70">({specInfo.version})</span>
            )}
          </div>
          <button
            onClick={toggleView}
            className="px-2 py-1 text-xs text-blue-300 hover:text-blue-200 hover:bg-blue-900/30 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Show Documentation
          </button>
        </div>
        <CodeBlock value={spec} language={format} showLineNumbers={true} />
      </div>
    );
  }

  if (!specObject) return null;

  // HTTP method colors
  const methodColors: Record<string, string> = {
    get: 'text-green-400 bg-green-500/10 border-green-500/30',
    post: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    put: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    delete: 'text-red-400 bg-red-500/10 border-red-500/30',
    patch: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    options: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
    head: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  };

  // Render formatted API documentation
  return (
    <div
      className={cn(
        'group relative my-4 rounded-xl overflow-hidden bg-zinc-900/80 border border-white/10 shadow-lg hover:shadow-xl transition-all duration-300',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/95 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-200">
            {specInfo?.title || 'API Documentation'}
          </span>
          {specInfo?.apiVersion && (
            <span className="text-xs text-gray-400 px-2 py-0.5 bg-white/5 rounded">
              v{specInfo.apiVersion}
            </span>
          )}
          {specInfo?.version && (
            <span className="text-xs text-gray-500">
              ({specInfo.version === '2.0' ? 'Swagger 2.0' : `OpenAPI ${specInfo.version}`})
            </span>
          )}
        </div>
        <button
          onClick={toggleView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="View source code"
        >
          <Code2 size={16} />
          <span className="hidden sm:inline">View Source</span>
        </button>
      </div>

      {/* Content */}
      <div className="overflow-auto custom-scrollbar bg-zinc-900/40" style={{ maxHeight: '800px' }}>
        <div className="p-4 space-y-4">
          {/* Info Section */}
          {specInfo?.description && (
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-2">Description</h3>
              <p className="text-sm text-white/70">{specInfo.description}</p>
            </div>
          )}

          {/* Servers */}
          {specObject.servers && specObject.servers.length > 0 && (
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
              <h3 className="text-sm font-semibold text-white mb-2">Servers</h3>
              <div className="space-y-2">
                {specObject.servers.map((server, idx) => (
                  <div key={idx} className="text-sm">
                    <code className="text-blue-300 bg-black/30 px-2 py-1 rounded">
                      {server.url}
                    </code>
                    {server.description && (
                      <span className="text-white/60 ml-2">- {server.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Endpoints */}
          {specObject.paths && Object.keys(specObject.paths).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 px-1">Endpoints</h3>
              <div className="space-y-2">
                {Object.entries(specObject.paths).map(([path, methods]) => (
                  <div key={path} className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
                    {Object.entries(methods).map(([method, details]: [string, any]) => {
                      const isExpanded = expandedPaths.has(`${method}:${path}`);
                      const methodClass = methodColors[method.toLowerCase()] || methodColors.get;

                      return (
                        <div key={`${method}:${path}`} className="border-b border-white/5 last:border-b-0">
                          {/* Method header */}
                          <button
                            onClick={() => togglePath(`${method}:${path}`)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors"
                          >
                            <span
                              className={cn(
                                'px-2 py-1 text-xs font-bold uppercase rounded border',
                                methodClass
                              )}
                            >
                              {method}
                            </span>
                            <code className="flex-1 text-sm text-white/90 text-left font-mono">
                              {path}
                            </code>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-white/60" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/60" />
                            )}
                          </button>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 bg-black/20">
                              {details.summary && (
                                <div>
                                  <h4 className="text-xs font-semibold text-white/80 mb-1">
                                    Summary
                                  </h4>
                                  <p className="text-sm text-white/70">{details.summary}</p>
                                </div>
                              )}

                              {details.description && (
                                <div>
                                  <h4 className="text-xs font-semibold text-white/80 mb-1">
                                    Description
                                  </h4>
                                  <p className="text-sm text-white/70">{details.description}</p>
                                </div>
                              )}

                              {details.parameters && details.parameters.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-white/80 mb-2">
                                    Parameters
                                  </h4>
                                  <div className="space-y-2">
                                    {details.parameters.map((param: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="p-2 bg-white/[0.02] border border-white/5 rounded"
                                      >
                                        <div className="flex items-center gap-2 mb-1">
                                          <code className="text-xs text-blue-300">
                                            {param.name}
                                          </code>
                                          <span className="text-xs text-white/50">
                                            ({param.in})
                                          </span>
                                          {param.required && (
                                            <span className="text-xs text-red-400">
                                              required
                                            </span>
                                          )}
                                        </div>
                                        {param.description && (
                                          <p className="text-xs text-white/60">
                                            {param.description}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {details.responses && (
                                <div>
                                  <h4 className="text-xs font-semibold text-white/80 mb-2">
                                    Responses
                                  </h4>
                                  <div className="space-y-2">
                                    {Object.entries(details.responses).map(
                                      ([code, response]: [string, any]) => (
                                        <div
                                          key={code}
                                          className="p-2 bg-white/[0.02] border border-white/5 rounded"
                                        >
                                          <div className="flex items-center gap-2 mb-1">
                                            <span
                                              className={cn(
                                                'text-xs font-semibold',
                                                code.startsWith('2')
                                                  ? 'text-green-400'
                                                  : code.startsWith('4')
                                                  ? 'text-yellow-400'
                                                  : code.startsWith('5')
                                                  ? 'text-red-400'
                                                  : 'text-white/70'
                                              )}
                                            >
                                              {code}
                                            </span>
                                            <span className="text-xs text-white/70">
                                              {response.description}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    )}
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
    </div>
  );
};

ApiSpecViewer.displayName = 'ApiSpecViewer';
