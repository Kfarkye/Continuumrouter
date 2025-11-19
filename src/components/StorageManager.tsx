import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
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
  Code2,
} from 'lucide-react';
import { SnippetQuickAdd } from './SnippetQuickAdd';
import { parseTypeScriptSnippet, formatSnippetForCopy } from '../utils/snippetParser';

interface StorageManagerProps {
  sessionId: string;
  onSchemaSelect?: (schema: SavedSchema) => void;
  className?: string;
  mode?: StorageMode;
}

interface StorageStats {
  count: number;
  totalSize: number;
  mode: StorageMode;
}

type FeedbackKind = 'success' | 'error';

interface FeedbackState {
  type: FeedbackKind;
  message: string;
}

interface SavedSchemaWithSize extends SavedSchema {
  approxSize: number;
}

type SchemaContent = SavedSchema['content'];

const calculateByteSize = (content: SchemaContent): number => {
  try {
    const serialized =
      typeof content === 'string'
        ? content
        : JSON.stringify(content);
    return new TextEncoder().encode(serialized).length;
  } catch {
    return 0;
  }
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handle);
    };
  }, [value, delay]);

  return debouncedValue;
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

  const [schemas, setSchemas] = useState<SavedSchemaWithSize[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats>({
    count: 0,
    totalSize: 0,
    mode,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<SavedSchemaWithSize | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((type: FeedbackKind, message: string) => {
    setFeedback({ type, message });

    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const fetchSchemas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await adapter.getSchemas(sessionId, {
        search: debouncedSearchQuery.trim() || undefined,
      });

      const enhanced: SavedSchemaWithSize[] = data.map((schema) => ({
        ...schema,
        approxSize: calculateByteSize(schema.content),
      }));

      setSchemas(enhanced);
      setStats(adapter.getStorageStats(sessionId));
    } catch (err) {
      console.error('Failed to fetch schemas:', err);
      setError('Failed to load schemas. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [adapter, sessionId, debouncedSearchQuery]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string }>;
      const eventType = customEvent.detail?.type;

      if (eventType === 'schema_saved' || eventType === 'schema_deleted') {
        fetchSchemas();
      }
    };

    window.addEventListener('ai_chat_storage', handleStorageEvent as EventListener);

    return () => {
      window.removeEventListener('ai_chat_storage', handleStorageEvent as EventListener);
    };
  }, [fetchSchemas]);

  useEffect(() => {
    if (!isModalOpen || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
        setSelectedSchema(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

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
      showFeedback('success', 'Export started.');
    } catch (err) {
      console.error('Export failed:', err);
      showFeedback('error', 'Failed to export schemas.');
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = await adapter.importSchemas(sessionId, file);
      showFeedback(
        'success',
        `Imported ${imported} schema${imported === 1 ? '' : 's'}.`,
      );
      fetchSchemas();
    } catch (err) {
      console.error('Import failed:', err);
      showFeedback('error', 'Failed to import schemas. Check the file format.');
    } finally {
      event.target.value = '';
    }
  };

  const deleteSchema = async (id: string) => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Delete this schema? This action cannot be undone.',
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      await adapter.deleteSchema(id, sessionId);
      setSchemas((prev) => prev.filter((schema) => schema.id !== id));
      setStats(adapter.getStorageStats(sessionId));
      showFeedback('success', 'Schema deleted.');
    } catch (err) {
      console.error('Failed to delete schema:', err);
      showFeedback('error', 'Failed to delete schema.');
    }
  };

  const downloadSchema = (schema: SavedSchemaWithSize) => {
    const content =
      typeof schema.content === 'string'
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

  const copyToClipboard = async (schema: SavedSchemaWithSize) => {
    let content =
      typeof schema.content === 'string'
        ? schema.content
        : JSON.stringify(schema.content, null, 2);

    try {
      const parsed = parseTypeScriptSnippet(content);
      content = formatSnippetForCopy(parsed, { includeImports: true });
    } catch {
      // Keep original content when parsing fails
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedId(schema.id);
      showFeedback('success', 'Snippet copied to clipboard.');

      setTimeout(() => {
        setCopiedId((current) => (current === schema.id ? null : current));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showFeedback('error', 'Failed to copy to clipboard.');
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

  const handleCardClick = (schema: SavedSchemaWithSize) => {
    setSelectedSchema(schema);
    setIsModalOpen(true);
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
            {stats.mode === 'local'
              ? 'Local'
              : stats.mode === 'hybrid'
              ? 'Hybrid'
              : 'Cloud'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-white/40">
            {formatSize(stats.totalSize)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 hover:from-blue-500/20 hover:to-purple-500/20 border border-white/[0.1] text-white/90 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5"
              title="Quick Add Snippet"
            >
              <Code2 className="w-3.5 h-3.5" />
              Quick Add
            </button>
            <button
              onClick={handleExport}
              className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
              title="Export All"
            >
              <Download className="w-4 h-4" strokeWidth={2} />
            </button>
            <label
              className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/[0.05] rounded-lg transition-all duration-200 cursor-pointer"
              title="Import"
            >
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
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
            strokeWidth={2}
          />
          <input
            type="text"
            placeholder="Search schemas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:bg-white/[0.05] focus:border-white/[0.15] focus:outline-none transition-all duration-200"
          />
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mx-6 mb-3 p-3 rounded-xl flex items-center justify-between text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/10 border border-red-500/40 text-red-200'
          }`}
        >
          <span className="truncate">{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="ml-4 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white/90 transition-colors"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      )}

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
        {isLoading ? (
          <div className="space-y-3 mt-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/[0.06] rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/[0.08] rounded" />
                    <div className="h-3 bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileCode className="w-16 h-16 text-white/20 mb-4" strokeWidth={1.5} />
            <h3 className="text-base font-medium text-white/70 mb-2">
              No snippets saved yet
            </h3>
            <p className="text-sm text-white/40 mb-4">
              Paste TypeScript code to save and organize your snippets
            </p>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            >
              <Code2 className="w-4 h-4" />
              Add Your First Snippet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {schemas.map((schema) => (
              <div
                key={schema.id}
                className="group p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.1] rounded-xl cursor-pointer transition-all duration-200"
                onClick={() => handleCardClick(schema)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/[0.05] rounded-lg flex items-center justify-center shrink-0">
                    <Code2 className="w-5 h-5 text-white/60" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-sm font-medium text-white/90 mb-1 truncate"
                      title={schema.name}
                    >
                      {schema.name}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span>{formatSize(schema.approxSize)}</span>
                      <span>•</span>
                      <span>{formatDate(schema.created_at)}</span>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
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

      {showQuickAdd && (
        <SnippetQuickAdd
          sessionId={sessionId}
          onSaved={() => {
            setShowQuickAdd(false);
            fetchSchemas();
          }}
        />
      )}

      {isModalOpen && selectedSchema && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => {
            setIsModalOpen(false);
            setSelectedSchema(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="schema-modal-title"
        >
          <div
            className="w-full max-w-4xl max-h-[80vh] bg-[#0a0a0a] border border-white/[0.1] rounded-2xl flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h2
                  id="schema-modal-title"
                  className="text-lg font-semibold text-white/90"
                >
                  {selectedSchema.name}
                </h2>
                <span className="text-xs text-white/40 mt-1">
                  {formatDate(selectedSchema.created_at)}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedSchema(null);
                }}
                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.05] rounded-lg transition-all duration-200"
                aria-label="Close schema preview"
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
