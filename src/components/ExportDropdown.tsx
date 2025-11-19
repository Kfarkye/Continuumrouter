import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, FileText, FileJson, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ExportFormat = 'markdown' | 'json';

interface ExportDropdownProps {
  onExport: (format: ExportFormat) => Promise<void>;
  disabled?: boolean;
  messageCount: number;
}

const LARGE_EXPORT_THRESHOLD = 500;

export const ExportDropdown: React.FC<ExportDropdownProps> = ({ onExport, disabled = false, messageCount }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isLargeExport = messageCount > LARGE_EXPORT_THRESHOLD;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);

      setTimeout(() => {
        const firstItem = dropdownRef.current?.querySelector('[role="menuitem"]');
        (firstItem as HTMLElement)?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;

    setExporting(true);
    setIsOpen(false);

    try {
      await onExport(format);
    } catch (error) {
      console.error(`Exporting as ${format} failed:`, error);
    } finally {
      setExporting(false);
      buttonRef.current?.focus();
    }
  };

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = dropdownRef.current?.querySelectorAll('[role="menuitem"]');
      if (!items || items.length === 0) return;

      const activeElement = document.activeElement;
      let currentIndex = -1;
      items.forEach((item, index) => {
        if (item === activeElement) {
          currentIndex = index;
        }
      });

      let nextIndex;
      if (event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % items.length;
      } else {
        nextIndex = (currentIndex - 1 + items.length) % items.length;
      }
      (items[nextIndex] as HTMLElement).focus();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleMenuKeyDown}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || exporting}
        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Export conversation"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {exporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Exporting...</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {isOpen && !exporting && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-72 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
            role="menu"
          >
            <div className="p-2 space-y-1">
              <button
                onClick={() => handleExport('markdown')}
                disabled={exporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 focus:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                role="menuitem"
              >
                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 group-focus:bg-blue-500/20 transition-colors">
                  <FileText className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">Markdown (.md)</div>
                  <div className="text-xs text-gray-400">Good for sharing and documentation</div>
                </div>
              </button>

              <button
                onClick={() => handleExport('json')}
                disabled={exporting}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 focus:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                role="menuitem"
              >
                <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 group-focus:bg-green-500/20 transition-colors">
                  <FileJson className="w-4 h-4 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">JSON (.json)</div>
                  <div className="text-xs text-gray-400">Good for data processing</div>
                </div>
              </button>
            </div>

            <div className={`px-3 py-2 border-t border-white/5 ${isLargeExport ? 'bg-yellow-950/50' : 'bg-zinc-900/50'}`}>
                {isLargeExport ? (
                    <div className="flex items-center gap-2 text-xs text-yellow-300">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
                        <p>Large conversation ({messageCount} messages). Export may take longer.</p>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">
                        Large conversations use background processing.
                    </p>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
