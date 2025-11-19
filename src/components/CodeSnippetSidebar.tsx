// src/components/CodeSnippetSidebar.tsx
import React, { useState, useMemo, useCallback, useEffect, useRef, memo, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Spinner } from './Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2,
  Star,
  Copy,
  Download,
  Navigation,
  Search,
  X,
  FileCode,
  ArrowDownToLine,
  Check,
  Maximize,
  Minimize,
  ChevronDown,
} from 'lucide-react';
// Assuming types, utils, and contexts paths are correct based on previous context
import type { CodeSnippet } from '../types';
import { getLanguageDisplayName } from '../lib/utils';
import { useInputInjection } from '../contexts/InputInjectionContext';
import { toast } from 'react-hot-toast';
// Import the enhanced CodeBlock component for previews
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface CodeSnippetSidebarProps {
  snippets: CodeSnippet[];
  isLoading: boolean;
  isExtracting: boolean;
  onToggleBookmark: (snippetId: string) => void;
  onCopySnippet: (snippet: CodeSnippet) => void;
  onDownloadSnippet: (snippet: CodeSnippet) => void;
  onNavigateToMessage: (messageId: string) => void;
  onClose: () => void;
}

interface LanguageGroupData {
  language: string;
  displayName: string;
  snippets: CodeSnippet[];
}

type FilterMode = 'all' | 'bookmarked';

// Centralized interface for passing actions down
interface SnippetActions {
    onToggleBookmark: (snippetId: string) => void;
    onCopySnippet: (snippet: CodeSnippet) => void;
    onDownloadSnippet: (snippet: CodeSnippet) => void;
    onNavigateToMessage: (messageId: string) => void;
    onInsertSnippet: (snippet: CodeSnippet) => void;
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

// ENHANCEMENT: Utility hook for local storage persistence
const useLocalStorageState = <T,>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [state, setState] = useState<T>(() => {
        if (typeof window === 'undefined') return defaultValue;
        try {
            const item = window.localStorage.getItem(key);
            // Parse stored json or if none return default value
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            // Handle potential QuotaExceededError or other issues
            console.error(`Error writing to localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CodeSnippetSidebar: React.FC<CodeSnippetSidebarProps> = ({
  snippets,
  isLoading,
  isExtracting,
  onToggleBookmark,
  onCopySnippet,
  onDownloadSnippet,
  onNavigateToMessage,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  
  // ENHANCEMENT: Persistence and Intelligent Initialization Logic
  // We store the expansion state as an array of strings (language keys).
  const [storedExpansion, setStoredExpansion] = useLocalStorageState<string[] | null>('codeSidebar_expandedLanguages', null);
  // We use a Set internally for efficient lookups, initialized from the stored array.
  const [expandedLanguagesSet, setExpandedLanguagesSet] = useState<Set<string>>(new Set(storedExpansion || []));

  const { injectContent } = useInputInjection();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Effect to handle persistence updates when the Set changes
  useEffect(() => {
    setStoredExpansion(Array.from(expandedLanguagesSet));
  }, [expandedLanguagesSet, setStoredExpansion]);

  // Effect for intelligent initialization (if storage was null/empty on first load)
  useEffect(() => {
    // Check if we haven't initialized from storage yet (storedExpansion === null) 
    // or if storage was explicitly empty (Array.isArray(storedExpansion) && storedExpansion.length === 0)
    if ((storedExpansion === null || (Array.isArray(storedExpansion) && storedExpansion.length === 0)) && snippets.length > 0) {
        const uniqueLanguages = new Set(snippets.map(s => s.language));
        // If there are 3 or fewer languages, expand them by default as a convenience on the initial load.
        if (uniqueLanguages.size > 0 && uniqueLanguages.size <= 3) {
            setExpandedLanguagesSet(uniqueLanguages);
        }
    }
  // We only want this logic to run when snippets change and storedExpansion hasn't been initialized meaningfully yet.
  }, [snippets, storedExpansion]);


  // ENHANCEMENT: A11y - Focus management when opening
  useEffect(() => {
    // Focus the search input when the sidebar mounts/opens
    // Use a slight delay to ensure the animation completes
    const timer = setTimeout(() => searchInputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  // ENHANCEMENT: A11y - Handle Escape key behavior and Ctrl+F
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    // Ctrl/Cmd + F focuses search
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
    }

    if (event.key === 'Escape') {
        // If search is focused and has content, clear search first.
        if (document.activeElement === searchInputRef.current && searchQuery) {
            event.preventDefault();
            setSearchQuery('');
        } else {
            // Otherwise, close the sidebar.
            event.preventDefault();
            onClose();
        }
    }
  }, [onClose, searchQuery]);


  // Handle snippet insertion into input
  const handleInsertSnippet = useCallback((snippet: CodeSnippet) => {
    injectContent(snippet.content, {
      wrapInCodeBlock: true,
      language: snippet.language,
      focus: true,
      append: true,
      prependNewline: true,
      appendNewline: true,
    });
    toast.success('Code inserted into input');
  }, [injectContent]);

  // Filter and group snippets
  const { languageGroups } = useMemo(() => {
    // 1. Apply global filters (Bookmark)
    let filtered = snippets;
    if (filterMode === 'bookmarked') {
        filtered = filtered.filter(s => s.isBookmarked);
    }

    // 2. Apply search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(snippet => 
            snippet.content.toLowerCase().includes(query) ||
            snippet.language.toLowerCase().includes(query) ||
            snippet.userDefinedName?.toLowerCase().includes(query) ||
            snippet.detectedFileName?.toLowerCase().includes(query)
        );
    }

    // 3. Group by language
    const grouped = new Map<string, CodeSnippet[]>();
    filtered.forEach(snippet => {
      const existing = grouped.get(snippet.language) || [];
      existing.push(snippet);
      grouped.set(snippet.language, existing);
    });

    // 4. Create language groups
    const groups: LanguageGroupData[] = Array.from(grouped.entries()).map(([language, snippets]) => ({
      language,
      displayName: getLanguageDisplayName(language),
      // Sort snippets within group chronologically (ascending)
      snippets: snippets.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }));

    // 5. Sort groups: first by count (descending), then alphabetically
    groups.sort((a, b) => {
        if (b.snippets.length !== a.snippets.length) {
            return b.snippets.length - a.snippets.length;
        }
        return a.displayName.localeCompare(b.displayName);
    });

    return { filteredSnippets: filtered, languageGroups: groups };
  }, [snippets, searchQuery, filterMode]);

  // Toggle language group expansion
  const toggleLanguageExpanded = useCallback((language: string) => {
    setExpandedLanguagesSet(prev => {
        const next = new Set(prev);
        if (next.has(language)) {
            next.delete(language);
        } else {
            next.add(language);
        }
        return next;
    });
  }, []);

  // Expand/Collapse all handlers
  // Determine if all currently visible groups are expanded
  const isAllExpanded = languageGroups.length > 0 && languageGroups.every(g => expandedLanguagesSet.has(g.language));

  const toggleExpandAll = useCallback(() => {
    // If the goal is to collapse, we collapse all (Set to empty).
    if (isAllExpanded) {
        setExpandedLanguagesSet(new Set());
    } else {
        // If the goal is to expand, we expand only the currently visible groups.
        setExpandedLanguagesSet(new Set(languageGroups.map(g => g.language)));
    }
  }, [isAllExpanded, languageGroups]);


  const bookmarkedCount = useMemo(() => snippets.filter(s => s.isBookmarked).length, [snippets]);

  // Centralized actions object (Memoized for optimization)
  const actions: SnippetActions = useMemo(() => ({
    onToggleBookmark,
    onCopySnippet,
    onDownloadSnippet,
    onNavigateToMessage,
    onInsertSnippet: handleInsertSnippet
  }), [onToggleBookmark, onCopySnippet, onDownloadSnippet, onNavigateToMessage, handleInsertSnippet]);

  return (
    // ENHANCEMENT: Use 'aside' semantic tag. Assuming integration adjacent to ChatInterface, we adjust layout classes.
    <motion.aside
      ref={sidebarRef}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      // Smoother transition
      transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
      // A11y: Add role, label, keyboard handler, and make focusable
      role="complementary"
      aria-label="Code Snippets Sidebar"
      onKeyDown={handleKeyDown}
      tabIndex={-1} 
      className="w-80 md:w-96 h-full bg-zinc-950/95 backdrop-blur-xl border-l border-white/10 z-40 flex flex-col shadow-2xl focus:outline-none shrink-0"
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-zinc-950/80 z-20">
        <div className="flex items-center gap-3">
          <Code2 className="w-5 h-5 text-blue-400" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-white">Code Snippets</h2>
          {isExtracting && (
            <div title="Extracting new snippets..." role="status" aria-label="Extracting snippets">
                <Spinner size="sm" color="blue" />
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Close sidebar (Esc)"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5 text-white/70 hover:text-white" />
        </button>
      </header>

    
      {/* Search & Filters (Sticky Container) */}
      {/* Note: Sticky positioning relies on the parent container's layout */}
      <div className="p-4 border-b border-white/10 sticky top-[65px] z-10 bg-zinc-950/80 backdrop-blur-md">
        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search snippets (Ctrl+F)..."
            className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all"
            aria-label="Search snippets"
          />
           {/* Clear Search Button */}
           {searchQuery && (
               <button
                    onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-white/40 hover:text-white/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                    title="Clear search (Esc)"
                    aria-label="Clear search"
               >
                   <X className="w-4 h-4" />
               </button>
           )}
        </div>

         {/* Filter Toggle (Accessible Radiogroup/Tablist) */}
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-0.5 bg-white/5 border border-white/10 rounded-lg" role="tablist" aria-label="Filter snippets">
                <button
                    role="tab"
                    aria-selected={filterMode === 'all'}
                    onClick={() => setFilterMode('all')}
                    className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        filterMode === 'all' ? "bg-blue-500/20 text-blue-400 shadow-sm" : "text-white/60 hover:bg-white/10"
                    )}
                >
                    All ({snippets.length})
                </button>
                <button
                    role="tab"
                    aria-selected={filterMode === 'bookmarked'}
                    onClick={() => setFilterMode('bookmarked')}
                    disabled={bookmarkedCount === 0}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500",
                        filterMode === 'bookmarked' ? "bg-yellow-500/20 text-yellow-400 shadow-sm" : "text-white/60 hover:bg-white/10",
                        bookmarkedCount === 0 && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {/* Star icon visualization logic */}
                    <Star className={cn("w-3 h-3", bookmarkedCount > 0 && (filterMode === 'bookmarked' ? "fill-current" : "text-yellow-400"))} aria-hidden="true"/>
                    Bookmarked ({bookmarkedCount})
                </button>
            </div>

            {/* Expand/Collapse All */}
            {/* Only show if there is more than 1 group currently visible */}
            {languageGroups.length > 1 && (
                 <button
                    onClick={toggleExpandAll}
                    className="text-xs text-white/60 hover:text-white/90 transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md px-1"
                    title={isAllExpanded ? "Collapse All" : "Expand All"}
                    aria-label={isAllExpanded ? "Collapse All Groups" : "Expand All Groups"}
                >
                    {isAllExpanded ? <Minimize className='w-3.5 h-3.5' aria-hidden="true"/> : <Maximize className='w-3.5 h-3.5' aria-hidden="true"/>}
                    {isAllExpanded ? "Collapse" : "Expand"}
                </button>
            )}
         </div>
      </div>


      {/* Snippet List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center h-full" role="status">
            <Spinner size="lg" color="blue" />
          </div>
        ) : languageGroups.length === 0 ? (
          <EmptyState searchQuery={searchQuery} filterMode={filterMode} />
        ) : (
          // ENHANCEMENT: A11y - Use ARIA Tree roles
          // We use padding-bottom to ensure the last item isn't obscured.
          <div className="pb-4" role="tree" aria-label="Code Snippets by Language">
            {languageGroups.map(group => (
              <LanguageGroupItem
                key={group.language}
                group={group}
                isExpanded={expandedLanguagesSet.has(group.language)}
                onToggle={() => toggleLanguageExpanded(group.language)}
                actions={actions}
              />
            ))}
          </div>
        )}
      </div>
    </motion.aside>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface EmptyStateProps {
    searchQuery: string;
    filterMode: FilterMode;
}

const EmptyState = memo<EmptyStateProps>(({ searchQuery, filterMode }) => {
    let message = 'No code snippets found yet.';
    let explanation = 'Code blocks from assistant messages will appear here.';

    if (searchQuery && filterMode === 'bookmarked') {
        message = 'No bookmarked snippets match your search.';
        explanation = '';
    } else if (searchQuery) {
        message = 'No snippets match your search criteria.';
        explanation = '';
    } else if (filterMode === 'bookmarked') {
        message = 'You have no bookmarked snippets.';
        explanation = 'Use the star icon to bookmark snippets.';
    }

    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-4" role="alert">
            <FileCode className="w-12 h-12 text-white/20 mb-3" aria-hidden="true" />
            <p className="text-white/60 text-sm">{message}</p>
            {explanation && (
                <p className="text-white/40 text-xs mt-1">{explanation}</p>
            )}
        </div>
    );
});
EmptyState.displayName = 'EmptyState';


interface LanguageGroupItemProps {
  group: LanguageGroupData;
  isExpanded: boolean;
  onToggle: () => void;
  actions: SnippetActions;
}

// Memoize LanguageGroupItem
const LanguageGroupItem = memo<LanguageGroupItemProps>(({
  group,
  isExpanded,
  onToggle,
  actions,
}) => {
  return (
    // ENHANCEMENT: A11y - Treeitem role for the container
    <div role="treeitem" aria-expanded={isExpanded}>
      {/* Language Header */}
      <button
        onClick={onToggle}
        // ENHANCEMENT: Sticky header within the scroll area for better UX
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors group focus:outline-none focus-visible:bg-white/10 sticky top-0 z-[5] bg-zinc-900/70 backdrop-blur-sm"
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.displayName} group`}
        aria-controls={`group-content-${group.language}`}
      >
        <div className="flex items-center gap-2">
          {/* Optimized Chevron animation using CSS transform */}
          <ChevronDown className={cn(
              "w-4 h-4 text-white/60 transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )} aria-hidden="true" />
          <span className="text-sm font-medium text-white">{group.displayName}</span>
        </div>
        <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
          {group.snippets.length}
        </span>
      </button>

      {/* Snippet Items */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`group-content-${group.language}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            // ENHANCEMENT: A11y - Group role for the list of children
            role="group"
            className="overflow-hidden"
          >
            {/* Apply padding to the inner div containing the list items */}
            <div className='px-4 py-2 space-y-3'>
                {group.snippets.map(snippet => (
                <SnippetItem
                    key={snippet.id}
                    snippet={snippet}
                    actions={actions}
                />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
LanguageGroupItem.displayName = 'LanguageGroupItem';


interface SnippetItemProps {
  snippet: CodeSnippet;
  actions: SnippetActions;
}

// ENHANCEMENT: Memoize SnippetItem and localize interaction state
const SnippetItem = memo<SnippetItemProps>(({
  snippet,
  actions,
}) => {
  // State to show copy confirmation feedback
  const [isCopied, setIsCopied] = useState(false);

  const displayName = snippet.userDefinedName || snippet.detectedFileName || `Snippet ${snippet.orderIndex + 1}`;
  
  const handleCopy = useCallback(() => {
    actions.onCopySnippet(snippet);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [actions, snippet]);

  // Define handlers for clarity
  const handleInsert = useCallback(() => actions.onInsertSnippet(snippet), [actions, snippet]);
  const handleNavigate = useCallback(() => actions.onNavigateToMessage(snippet.messageId), [actions, snippet.messageId]);
  const handleToggleBookmark = useCallback(() => actions.onToggleBookmark(snippet.id), [actions, snippet.id]);
  const handleDownload = useCallback(() => actions.onDownloadSnippet(snippet), [actions, snippet]);

  // ENHANCEMENT: A11y: Keyboard shortcuts handler (simple letters when focused)
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Ensure Ctrl/Meta keys are NOT pressed to avoid overriding browser shortcuts (like Ctrl+C for native copy, Ctrl+D for bookmark).
    if (event.ctrlKey || event.metaKey) return;

    switch (event.key) {
        case 'Enter':
        case ' ':
            // Default action: Navigate
            event.preventDefault();
            handleNavigate();
            break;
        case 'c':
        case 'C':
            // Copy (C)
            event.preventDefault();
            handleCopy();
            break;
        case 'i':
        case 'I':
             // Insert (I)
            event.preventDefault();
            handleInsert();
            break;
        case 'b':
        case 'B':
            // Bookmark (B)
            event.preventDefault();
            handleToggleBookmark();
            break;
        case 'd':
        case 'D':
            // Download (D)
            event.preventDefault();
            handleDownload();
            break;
    }
  }, [handleInsert, handleCopy, handleNavigate, handleToggleBookmark, handleDownload]);

  return (
    // ENHANCEMENT: A11y: Use role="treeitem", make focusable (tabIndex=0), and add focus-within/hover styles
    <div
      tabIndex={0}
      role="treeitem"
      onKeyDown={handleKeyDown}
      aria-label={`${displayName} (${snippet.language})`}
      // Use 'group' class and focus/focus-within styles for enhanced accessibility and appearance
      className="p-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950"
    >
      {/* Snippet Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400/80 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-sm font-medium text-white/90 truncate" title={displayName}>
              {displayName}
            </span>
          </div>
          <div className="text-xs text-white/50 mt-1 ml-6">
            {snippet.lineCount} line{snippet.lineCount !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={handleToggleBookmark}
          // tabIndex={-1} prevents double tab stops (container and button), relying on container focus + keyboard shortcuts
          tabIndex={-1} 
          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0 mt-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
          title={snippet.isBookmarked ? 'Remove bookmark (B)' : 'Bookmark snippet (B)'}
          aria-label={snippet.isBookmarked ? 'Remove bookmark' : 'Bookmark snippet'}
        >
          <Star
            className={cn(
                "w-4 h-4 transition-colors",
                snippet.isBookmarked
                ? 'text-yellow-400 fill-yellow-400'
                // Show dimmed icon that emphasizes on group hover/focus
                : 'text-white/30 group-hover:text-white/60 group-focus-within:text-white/60 hover:text-yellow-400'
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* ENHANCEMENT: Code Preview using CodeBlock component */}
      <div className="mb-3 rounded-md overflow-hidden border border-white/5 shadow-inner">
         <CodeBlock
            value={snippet.content}
            language={snippet.language}
            // Configure CodeBlock for minimal preview mode
            showLineNumbers={false}
            wrap={false}
            collapsible={false}
            // Limit height for preview (approx 4 lines * 22.4px/line + padding = 105.6px)
            height={106}
            // Override styles for integration
            className="!my-0 !rounded-none !bg-black/40 text-xs"
        />
      </div>

      {/* Actions */}
      {/* ENHANCEMENT: UX - Actions visible on hover/focus-within */}
      <div className="flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        
        <ActionButton onClick={handleInsert} title="Insert into input (I)" Icon={ArrowDownToLine} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 font-medium">
          Insert
        </ActionButton>
        
        <ActionButton onClick={handleCopy} title={isCopied ? "Copied!" : "Copy code (C)"} Icon={isCopied ? Check : Copy} className={isCopied ? 'text-green-400 hover:text-green-400 hover:bg-green-500/10' : ''} />

        <ActionButton onClick={handleNavigate} title="Navigate to message (Enter/Space)" Icon={Navigation} />
        
        <ActionButton onClick={handleDownload} title="Download (D)" Icon={Download} />

      </div>
    </div>
  );
});
SnippetItem.displayName = 'SnippetItem';


// ENHANCEMENT: Reusable Action Button component
interface ActionButtonProps {
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    title: string;
    Icon: React.ElementType;
    className?: string;
    children?: React.ReactNode;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, title, Icon, className, children }) => (
    <button
        onClick={onClick}
        // tabIndex={-1} prevents the button from being focused separately when tabbing through the list items.
        tabIndex={-1} 
        className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            className
        )}
        title={title}
        aria-label={title}
    >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {children}
    </button>
);