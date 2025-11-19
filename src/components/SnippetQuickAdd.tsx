import React, { useState } from 'react';
import { Spinner } from './Spinner';
import { Code, Save, X } from 'lucide-react';
import { parseTypeScriptSnippet, formatSnippetForCopy } from '../utils/snippetParser';
import { useStorageAdapter } from '../lib/storageAdapterHook';

interface SnippetQuickAddProps {
  sessionId: string;
  onSaved: () => void;
}

export const SnippetQuickAdd: React.FC<SnippetQuickAddProps> = ({ sessionId, onSaved }) => {
  const { adapter } = useStorageAdapter({ mode: 'hybrid' });
  const [pastedCode, setPastedCode] = useState('');
  const [parsedSnippet, setParsedSnippet] = useState<ReturnType<typeof parseTypeScriptSnippet> | null>(null);
  const [customName, setCustomName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  const parseAndSetSnippet = (text: string) => {
    setIsParsing(true);
    try {
      const parsed = parseTypeScriptSnippet(text);
      setParsedSnippet(parsed);
      setCustomName(parsed.name);
    } catch (error) {
      console.error('Failed to parse snippet:', error);
      setParsedSnippet(null);
      setCustomName('');
    } finally {
      setIsParsing(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text.trim()) {
      setPastedCode(text);
      parseAndSetSnippet(text);
    }
  };

  const handleCodeChange = (value: string) => {
    setPastedCode(value);
    if (value.trim()) {
      parseAndSetSnippet(value);
    } else {
      setParsedSnippet(null);
      setCustomName('');
    }
  };

  const handleSave = async () => {
    if (!parsedSnippet || !pastedCode.trim()) return;

    setIsSaving(true);
    try {
      const formatted = formatSnippetForCopy(parsedSnippet, {
        includeImports: true,
        includeComments: true,
      });

      // Assuming adapter.saveSchema expects name, content, session_id, description, format, source_file
      // and parsedSnippet.type maps to a valid format.
      await adapter.saveSchema(
        customName || parsedSnippet.name, // name
        formatted, // content
        sessionId, // session_id
        parsedSnippet.description, // description
        parsedSnippet.type, // format (assuming parsedSnippet.type maps to a valid format)
        undefined // source_file (not available in this context)
      );

      setPastedCode('');
      setParsedSnippet(null);
      setCustomName('');
      onSaved?.();
    } catch (error) {
      console.error('Failed to save snippet:', error);
      alert('Failed to save snippet');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPastedCode('');
    setParsedSnippet(null);
    setCustomName('');
    setIsParsing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900/95 border border-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Quick Add Snippet</h2>
              <p className="text-sm text-gray-400">Paste TypeScript code and save automatically</p>
            </div>
          </div>
          <button
            onClick={onSaved}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Paste Your Code
            </label>
            <textarea
              value={pastedCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste TypeScript/React code here..."
              className="w-full h-64 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-sm text-gray-200 font-mono placeholder:text-gray-500 focus:bg-gray-800 focus:border-blue-500 focus:outline-none resize-none transition-all"
            />
            {isParsing && (
              <div className="mt-2 flex items-center gap-2 text-sm text-blue-400">
                <Spinner size="sm" color="white" />
                <span>Parsing code...</span>
              </div>
            )}
          </div>

          {parsedSnippet && (
            <div className="space-y-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Code className="w-4 h-4 text-green-400" />
                <span>Detected: <span className="text-white font-medium capitalize">{parsedSnippet.type}</span></span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Snippet Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-xl text-sm text-gray-200 placeholder:text-gray-500 focus:bg-gray-800 focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>

              {parsedSnippet.description && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <p className="text-sm text-gray-400">{parsedSnippet.description}</p>
                </div>
              )}

              {parsedSnippet.dependencies.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dependencies
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {parsedSnippet.dependencies.map((dep) => (
                      <span
                        key={dep}
                        className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs rounded-md font-mono"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsedSnippet.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {parsedSnippet.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded-md"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm font-medium transition-all"
          >
            Reset
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onSaved}
              className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!parsedSnippet || !pastedCode.trim() || isSaving || isParsing}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Snippet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};