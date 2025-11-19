import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Spinner } from './Spinner';
import ReactDOM from 'react-dom';
// Assuming Prompt type is imported.
// import { Prompt } from '../types';
import { X, Search, Plus, FileText, Copy, Edit2, Trash2, Check, Command, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Placeholder types if not imported (ensure these match your actual types)
interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string; // Category might be an empty string if not set in storage
  tags: string[];
  lastModified?: number;
}

interface PromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsePrompt: (prompt: Prompt) => void;
  onCreateNew: () => void;
}

// --- Utility Components (Design System Approach - Zinc/Blue Theme) ---

// Primary Button (e.g., Save, Create)
const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType, loading?: boolean }> = ({ children, icon: Icon, loading, className, ...props }) => (
  <button
    // Using a professional blue accent color.
    className={`h-9 px-4 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    disabled={loading || props.disabled}
    {...props}
  >
    {loading ? <Spinner size="sm" color="white" /> : Icon && <Icon className="size-4" />}
    {children}
  </button>
);

// Secondary Button (e.g., Cancel)
const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ElementType }> = ({ children, icon: Icon, className, ...props }) => (
  <button
    // Using subtle zinc colors for secondary actions.
    className={`h-9 px-4 flex items-center justify-center gap-2 bg-zinc-700/50 border border-zinc-700 text-zinc-200 text-sm font-medium rounded-lg shadow-sm hover:bg-zinc-700 transition-all duration-150 ease-in-out ${className}`}
    {...props}
  >
    {Icon && <Icon className="size-4" />}
    {children}
  </button>
);

// Icon Button (e.g., Edit, Delete, Copy)
const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ElementType, danger?: boolean }> = ({ icon: Icon, danger, className, ...props }) => (
  <button
    className={`flex items-center justify-center p-2 rounded-md transition-all duration-150 ease-in-out
      ${danger
        // Red accent for destructive actions
        ? 'text-red-500/80 hover:bg-red-500/10 hover:text-red-500 bg-zinc-800/50'
        // Standard subtle background
        : 'text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700'
      } ${className}`}
    {...props}
  >
    <Icon className="size-4" />
  </button>
);


// --- Main Component ---

export const PromptLibraryModal: React.FC<PromptLibraryModalProps> = ({
  isOpen,
  onClose,
  onUsePrompt,
  onCreateNew,
}) => {
  // State normalized prompts where category is guaranteed to be a display-ready string
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  // Edit form now includes category management
  const [editForm, setEditForm] = useState<{ title: string; content: string; tags: string; category: string }>({ title: '', content: '', tags: '', category: '' });
  const [isLoading, setIsLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const UNCATEGORIZED = 'Uncategorized';

  // --- Data Handling & Normalization ---

  const loadPrompts = useCallback(() => {
    setIsLoading(true);
    // In a real app, this might be an async API call.
    const stored = localStorage.getItem('aiAssistant_prompts');
    if (stored) {
      try {
        const parsedPrompts = JSON.parse(stored);
        if (Array.isArray(parsedPrompts)) {
            // Normalize data on load: Ensure every prompt has a category for display logic.
            // If category is empty string or missing, use UNCATEGORIZED constant.
            const normalizedPrompts = parsedPrompts.map(p => ({
                ...p,
                category: (p.category && p.category.trim()) ? p.category.trim() : UNCATEGORIZED
            }));
          setPrompts(normalizedPrompts);
        }
      } catch (e) {
        console.error('Failed to load prompts:', e);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPrompts();
    }
  }, [isOpen, loadPrompts]);

  // --- Actions ---

  const savePrompts = (prompts: Prompt[]) => {
    localStorage.setItem('aiAssistant_prompts', JSON.stringify(prompts));
    setPrompts(prompts);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard!');
  };

  const handleUse = (prompt: Prompt) => {
    onUsePrompt(prompt);
    // Optionally, close the modal after using a prompt.
    // onClose();
  };

  const handleDelete = (id: string) => {
    // Simple confirmation, consider a custom confirmation modal for a more polished UX.
    if (window.confirm('Are you sure you want to delete this prompt?')) {
      const filtered = prompts.filter(p => p.id !== id);
      savePrompts(filtered);
      toast.success('Prompt deleted.');
    }
  };

  // --- Editing Logic ---

  const startEdit = (prompt: Prompt) => {
    setEditingPromptId(prompt.id);
    setEditForm({
      title: prompt.title,
      content: prompt.content,
      tags: prompt.tags.join(', '),
      category: prompt.category === UNCATEGORIZED ? '' : prompt.category // Allow editing the category
    });
  };

  const cancelEdit = () => {
    setEditingPromptId(null);
    setEditForm({ title: '', content: '', tags: '', category: '' });
  };

  const saveEdit = () => {
    const title = editForm.title.trim();
    const content = editForm.content.trim();
    if (!title || !content) {
      toast.error('Title and content cannot be empty.');
      return;
    }

    const updatedPrompts = prompts.map(p => {
      if (p.id === editingPromptId) {
        // If category field is empty during edit, revert to UNCATEGORIZED
        const newCategory = editForm.category.trim() || UNCATEGORIZED;
        return {
          ...p,
          title: title,
          content: content,
          category: newCategory,
          tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          lastModified: Date.now()
        };
      }
      return p;
    });

    savePrompts(updatedPrompts);
    setEditingPromptId(null);
    toast.success('Prompt updated successfully.');
  };

  // --- Filtering and Memoization ---

  // Calculate categories and their counts
  const { categories, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    prompts.forEach(p => {
      // Prompts are normalized, so p.category is always present.
      counts[p.category] = (counts[p.category] || 0) + 1;
    });

    // Sort categories alphabetically, but ensure Uncategorized appears last.
    const uniqueCategories = Object.keys(counts).sort((a, b) => {
        if (a === UNCATEGORIZED) return 1;
        if (b === UNCATEGORIZED) return -1;
        return a.localeCompare(b);
    });

    return {
        categories: ['All', ...uniqueCategories],
        categoryCounts: counts
    };
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      if (!matchesCategory) return false;

      if (search) {
        const normalizedSearch = search.toLowerCase();
        const matchesSearch =
            p.title.toLowerCase().includes(normalizedSearch) ||
            p.content.toLowerCase().includes(normalizedSearch) ||
            p.tags.some(tag => tag.toLowerCase().includes(normalizedSearch));
        return matchesSearch;
      }
      return true;
      // Sort by last modified (descending) for recency
    }).sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  }, [prompts, search, selectedCategory]);

  // Standardized Modal behavior effects (Matches Sidebar.tsx Modal)
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        modalRef.current?.focus();
    }

    return () => {
        document.removeEventListener('keydown', handleEscape);
        // Ensure overflow is reset when modal closes
        if (isOpen) {
           document.body.style.overflow = 'unset';
        }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Common style for inputs during editing (Unified focus state)
  const editInputBaseStyle = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150";

  // --- Render ---
  // Using React Portal and standardized structure.

  const modalContent = (
    <div
        // Backdrop: Matches standardized design
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-opacity duration-300"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={modalRef}
        onClick={onClose}
    >
        <div
            // Modal Container: Matches standardized design (bg-[#101010], rounded-3xl, max-w-5xl/85vh)
            // The internal elements retain the Zinc styling for a subtle contrast
            className="relative bg-[#101010] border border-white/[0.15] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden transition-transform duration-300 ease-out"
            onClick={e => e.stopPropagation()}
        >
            {/* Header Section (Matches standardized design) */}
            <header className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#101010] z-10">
                <div className="flex flex-col">
                    <h2 className="text-xl font-semibold text-white">Prompt Library</h2>
                     <p className="text-sm text-white/60">Manage and organize your saved prompts</p>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all duration-200"
                    aria-label="Close Modal"
                >
                    <X size={18} />
                </button>
            </header>

            {/* Main Content Area: Application Layout (Sidebar + Content) */}
            {/* Internal elements retain the Zinc styling provided in the prompt for a subtle contrast */}
            <div className="flex-1 flex overflow-hidden">

                {/* Sidebar Navigation (Categories) */}
                {/* We keep the Zinc styling here as defined in the prompt's version for the internal layout */}
                <nav className="w-56 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/30 p-4 flex flex-col">
                   <div className='flex-1 overflow-y-auto'>
                    <h3 className="text-xs uppercase tracking-wide font-semibold text-zinc-500 mb-3">Categories</h3>
                    <ul className="space-y-1">
                        {categories.map(cat => {
                            const count = cat === 'All' ? prompts.length : (categoryCounts[cat] || 0);
                            return (
                                <li key={cat}>
                                    <button
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center justify-between
                                            ${selectedCategory === cat
                                                ? 'bg-zinc-800 text-white font-medium'
                                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                                            }`}
                                    >
                                        <span className='truncate'>{cat}</span>
                                        <span className='text-xs text-zinc-500 ml-2'>{count}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                   </div>

                   {/* Create New Button (Bottom of Sidebar) */}
                   <div className='pt-4 border-t border-zinc-800'>
                        <PrimaryButton
                            icon={Plus}
                            onClick={onCreateNew}
                            className='w-full'
                        >
                            Create New
                        </PrimaryButton>
                   </div>
                </nav>

                {/* Prompts View Area */}
                <div className="flex-1 flex flex-col">

                    {/* Search and Actions Bar */}
                    <div className="p-5 border-b border-zinc-800 shrink-0">
                         <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search prompts by title, content, or tags..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-10 pl-10 pr-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                            />
                         </div>
                    </div>

                    {/* Prompts List */}
                    <div className="flex-1 overflow-y-auto p-5">
                        {isLoading ? (
                            <div className='flex items-center justify-center h-40'>
                                <Spinner size="lg" color="white" />
                            </div>
                        ) : filteredPrompts.length === 0 ? (
                            <div className='flex flex-col items-center justify-center h-40 text-zinc-500'>
                                <FileText className='size-12 mb-3'/>
                                <p className='text-sm font-medium'>
                                    {search
                                        ? 'No prompts found matching your search.'
                                        : (selectedCategory === 'All' ? 'No prompts yet. Create your first one!' : `No prompts in "${selectedCategory}".`)
                                    }
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredPrompts.map(prompt => {
                                    const isEditing = editingPromptId === prompt.id;

                                    return (
                                        <div
                                            key={prompt.id}
                                            // Card styling: Subtle zinc background, border, rounded corners
                                            className='p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl transition-all duration-150 hover:border-zinc-700'
                                        >
                                            {isEditing ? (
                                                // Edit Mode
                                                <div className='space-y-3'>
                                                    {/* Title Input */}
                                                    <input
                                                        type='text'
                                                        value={editForm.title}
                                                        onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                                        placeholder='Title'
                                                        className={editInputBaseStyle}
                                                    />
                                                    {/* Content Textarea */}
                                                    <textarea
                                                        value={editForm.content}
                                                        onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                                                        placeholder='Prompt Content'
                                                        rows={4}
                                                        className={`${editInputBaseStyle} resize-none`}
                                                    />
                                                    {/* Category Input */}
                                                    <input
                                                        type='text'
                                                        value={editForm.category}
                                                        onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                                        placeholder='Category (Leave blank for Uncategorized)'
                                                        className={editInputBaseStyle}
                                                    />
                                                    {/* Tags Input */}
                                                    <input
                                                        type='text'
                                                        value={editForm.tags}
                                                        onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                                                        placeholder='Tags (comma-separated)'
                                                        className={editInputBaseStyle}
                                                    />

                                                    {/* Action Buttons */}
                                                    <div className='flex gap-2 justify-end'>
                                                        <SecondaryButton onClick={cancelEdit}>
                                                            Cancel
                                                        </SecondaryButton>
                                                        <PrimaryButton icon={Check} onClick={saveEdit}>
                                                            Save
                                                        </PrimaryButton>
                                                    </div>
                                                </div>
                                            ) : (
                                                // View Mode
                                                <>
                                                    {/* Prompt Header (Title, Category, Actions) */}
                                                    <div className='flex items-start justify-between mb-3'>
                                                        <div className='flex-1 min-w-0'>
                                                            <h4 className='text-base font-medium text-white mb-1 truncate'>{prompt.title}</h4>
                                                            <div className='flex items-center gap-2 text-xs text-zinc-500'>
                                                                <span className='px-2 py-0.5 bg-zinc-800 rounded'>{prompt.category}</span>
                                                                {prompt.lastModified && (
                                                                    <span>
                                                                        {new Date(prompt.lastModified).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div className='flex gap-1 ml-2'>
                                                            <IconButton icon={Copy} onClick={() => handleCopy(prompt.content)} title="Copy" />
                                                            <IconButton icon={Edit2} onClick={() => startEdit(prompt)} title="Edit" />
                                                            <IconButton icon={Trash2} danger onClick={() => handleDelete(prompt.id)} title="Delete" />
                                                        </div>
                                                    </div>

                                                    {/* Prompt Content (Truncated) */}
                                                    <p className='text-sm text-zinc-400 leading-relaxed mb-3 line-clamp-3'>
                                                        {prompt.content}
                                                    </p>

                                                    {/* Tags Display */}
                                                    {prompt.tags.length > 0 && (
                                                        <div className='flex flex-wrap gap-2 mb-3'>
                                                            {prompt.tags.map((tag, i) => (
                                                                <span key={i} className='text-xs px-2 py-1 bg-blue-500/10 text-blue-400 rounded'>
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Use Button */}
                                                    <button
                                                        onClick={() => handleUse(prompt)}
                                                        className='w-full h-9 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-all duration-150'
                                                    >
                                                        Use Prompt
                                                        <ChevronRight className='size-4'/>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
