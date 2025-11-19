import React, { useState, useCallback, useEffect } from 'react';
import { SavedSchema } from '../types';
import { useStorageAdapter, StorageMode } from '../lib/storageAdapterHook';
import {
  Download,
  Trash2,
  FileCode,
  FolderOpen,
  X,
  Search,
  Upload,
  Database,
  Copy,
  Check,
} from 'lucide-react';

interface StorageManagerProps {
  sessionId: string;
  onSchemaSelect?: (schema: SavedSchema) => void;
  className?: string;
  mode?: StorageMode;
}

export const StorageManager: React.FC<StorageManagerProps> = ({
  sessionId,
  onSchemaSelect,
  className = '',
  mode = 'hybrid',
}) => {
  const { adapter } = useStorageAdapter({
    mode,
    localStoragePrefix: 'ai_chat_schemas',
  });

  const [schemas, setSchemas] = useState<SavedSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ count: 0, totalSize: 0, mode: 'local' as StorageMode });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<SavedSchema | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSchemas = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await adapter.getSchemas(sessionId, {
        search: searchQuery,
      });

      setSchemas(data);
      setStats(adapter.getStorageStats(sessionId));
    } catch (err) {
      console.error('Failed to fetch schemas:', err);
      setError('Failed to load schemas. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [adapter, sessionId, searchQuery]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  useEffect(() => {
    const handleStorageEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (
        customEvent.detail.type === 'schema_saved' ||
        customEvent.detail.type === 'schema_deleted'
      ) {
        fetchSchemas();
      }
    };

    window.addEventListener('ai_chat_storage', handleStorageEvent);
    return () => window.removeEventListener('ai_chat_storage', handleStorageEvent);
  }, [fetchSchemas]);

  const handleExport = async () => {
    try {
      const blob = await adapter.exportSchemas(sessionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schemas_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export schemas');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = await adapter.importSchemas(sessionId, file);
      alert(`Successfully imported ${imported} schema(s)`);
      fetchSchemas();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import schemas. Please check the file format.');
    }

    event.target.value = '';
  };

  const deleteSchema = async (id: string) => {
    if (!window.confirm('Delete this schema? This action cannot be undone.')) {
      return;
    }

    try {
      await adapter.deleteSchema(id, sessionId);
      setSchemas((prev) => prev.filter((s) => s.id !== id));
      setStats(adapter.getStorageStats(sessionId));
    } catch (err) {
      console.error('Failed to delete schema:', err);
      alert('Failed to delete schema');
    }
  };

  const downloadSchema = (schema: SavedSchema) => {
    const content = typeof schema.content === 'string'
      ? schema.content
      : JSON.stringify(schema.content, null, 2);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schema.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (schema: SavedSchema) => {
    const content = typeof schema.content === 'string'
      ? schema.content
      : JSON.stringify(schema.content, null, 2);

    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(schema.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-white/60" strokeWidth={1.5} />
          <h2 className="text-base font-medium text-white/90">
            Stored Schemas ({stats.count})
          </h2>
          <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400 flex items-center gap-1.5">
            <Database className="w-3 h-3" strokeWidth={2} />
            {stats.mode === 'local' ? 'Local' : stats.mode === 'hybrid' ? 'Hybrid' : 'Cloud'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-white/40">
            {formatSize(stats.totalSize)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
              title="Export All"
            >
              <Download className="w-4 h-4" strokeWidth={2} />
            </button>
            <label className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.05] rounded-lg transition-all duration-200 cursor-pointer" title="Import">
              <Upload className="w-4 h-4" strokeWidth={2} />
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search schemas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:bg-white/[0.05] focus:border-white/[0.15] focus:outline-none transition-all duration-200"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between">
          <span className="text-sm text-red-300">{error}</span>
          <button
            onClick={fetchSchemas}
            className="text-sm text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileCode className="w-16 h-16 text-white/20 mb-4" strokeWidth={1.5} />
            <h3 className="text-base font-medium text-white/70 mb-2">
              No schemas saved yet
            </h3>
            <p className="text-sm text-white/40">
              Extracted schemas will appear here automatically
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {schemas.map((schema) => (
              <div
                key={schema.id}
                className="group p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.1] rounded-xl cursor-pointer transition-all duration-200"
                onClick={() => {
                  setSelectedSchema(schema);
                  setIsModalOpen(true);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/[0.05] rounded-lg flex items-center justify-center shrink-0">
                    <FileCode className="w-5 h-5 text-white/60" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white/90 mb-1 truncate" title={schema.name}>
                      {schema.name}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span>
                        {formatSize(new Blob([JSON.stringify(schema.content)]).size)}
                      </span>
                      <span>•</span>
                      <span>
                        {formatDate(schema.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => copyToClipboard(schema)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                      title="Copy to Clipboard"
                    >
                      {copiedId === schema.id ? (
                        <Check className="w-4 h-4 text-green-400" strokeWidth={2} />
                      ) : (
                        <Copy className="w-4 h-4" strokeWidth={2} />
                      )}
                    </button>
                    <button
                      onClick={() => downloadSchema(schema)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                      title="Download"
                    >
                      <Download className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => onSchemaSelect?.(schema)}
                      className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                      title="Use in Chat"
                    >
                      <FileCode className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => deleteSchema(schema.id)}
                      className="w-8 h-8 flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && selectedSchema && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="w-full max-w-4xl max-h-[80vh] bg-[#0a0a0a] border border-white/[0.1] rounded-2xl flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white/90">{selectedSchema.name}</h2>
                <span className="text-xs text-white/40 mt-1">
                  {formatDate(selectedSchema.created_at)}
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="p-4 bg-black/40 border border-white/[0.08] rounded-xl text-sm text-white/80 font-mono overflow-x-auto">
                <code>
                  {typeof selectedSchema.content === 'string'
                    ? selectedSchema.content
                    : JSON.stringify(selectedSchema.content, null, 2)}
                </code>
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3">
              <button
                onClick={() => downloadSchema(selectedSchema)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-white/80 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
              >
                <Download className="w-4 h-4" strokeWidth={2} />
                Download
              </button>
              <button
                onClick={() => copyToClipboard(selectedSchema)}
                className="px-4 py-2 bg-white text-black hover:bg-white/95 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
              >
                {copiedId === selectedSchema.id ? (
                  <>
                    <Check className="w-4 h-4" strokeWidth={2} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" strokeWidth={2} />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
