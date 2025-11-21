// Sidebar.tsx - Stripe × Jony Ive × Vercel Design Language
// Minimal, precise, and intentional. Every pixel matters.

import React, { useState, useRef, useEffect, useCallback, useMemo, memo, Fragment } from 'react';
import ReactDOM from 'react-dom';
import {
  Plus,
  Trash2,
  X,
  MessageSquare,
  Edit2,
  Check,
  AlertTriangle,
  Search,
  Brain,
  Zap,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Upload,
  LayoutDashboard,
  Microscope,
  Hammer,
  Wrench,
  ShieldCheck,
  MoreHorizontal,
  ChevronDown
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { toast } from 'react-hot-toast';
import { ChatSession, Prompt, Project as AISpace } from '../types';
import { Spinner } from './Spinner';
import { PromptLibraryModal } from './PromptLibraryModal';
import { PromptCreatorModal } from './PromptCreatorModal';
import { FilesModal } from './FilesModal';
import { ClinicianImportModal } from './ClinicianImportModal';

// ============================================================================
// DESIGN SYSTEM - Stripe × Vercel Precision
// ============================================================================
const THEME = {
  // Backgrounds - Vercel's neutral grays
  bg: 'bg-[#0a0a0a]',              // Deeper than Vercel's black
  bgElevated: 'bg-[#111111]',      // Elevated surfaces
  bgHover: 'hover:bg-[#1a1a1a]',   // Subtle hover state
  bgActive: 'bg-[#1a1a1a]',        // Active state

  // Typography - Precise hierarchy
  text: 'text-[#888888]',          // Secondary text (Vercel gray-500)
  textMuted: 'text-[#666666]',     // Tertiary text
  textActive: 'text-[#fafafa]',    // Primary text (near white)

  // Accents - Minimal blue
  accent: 'bg-[#0070f3]',          // Vercel blue
  accentHover: 'hover:bg-[#0761d1]',
  accentMuted: 'text-[#0070f3]',

  // Borders - Hairline precision
  border: 'border-[#1a1a1a]',      // Subtle dividers
  borderHover: 'border-[#333333]', // Interactive borders

  // Focus states - Accessibility first
  focusRing: 'focus:ring-1 focus:ring-[#0070f3] focus:ring-offset-0',

  // Modals
  modalBg: 'bg-[#111111]',
  modalOverlay: 'bg-black/60',     // Softer overlay
};

// ============================================================================
// UTILITY HOOKS
// ============================================================================

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type SectionType = 'conversations' | 'dashboard' | 'reply_assistant' | 'research' | 'build_mode' | 'tools' | 'system_rules' | 'storage' | 'import' | 'settings' | 'signout';

interface SidebarProps {
  spaces: AISpace[];
  currentSpaceId: string | null;
  onSpaceSwitch: (spaceId: string) => void;
  onSpaceCreate: (name: string, description?: string) => Promise<string>;
  onSpaceUpdate: (spaceId: string, name: string, description?: string) => Promise<void>;
  onSpaceDelete: (spaceId: string) => Promise<void>;

  sessions: ChatSession[];
  selectedSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onSessionCreate: () => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionUpdate: (sessionId: string, title: string) => void;
  onSignOut: () => void;
  isProcessing?: boolean;
  currentProgress?: number;
  currentStep?: string;
  currentModel?: 'claude' | 'gemini' | 'system';
  activeSection?: SectionType;

  onNavigate?: (section: SectionType) => void;
  onNavigateToDeepThink?: () => void;
  onNavigateToTutorial?: () => void;
  onNavigateToDashboard?: () => void;
  onFileSelect?: (files: File[]) => void;
  onStorageClick?: () => void;
  userId?: string;

  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItemType {
  id: SectionType;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  origin: string;
  action: 'modal' | 'navigate' | 'action';
  description: string;
  group: 'Workspace' | 'Resources';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const NAVIGATION_SECTIONS: NavItemType[] = [
  { id: 'conversations', label: 'Conversations', icon: MessageSquare, origin: 'history', action: 'modal', description: 'View history', group: 'Workspace' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, origin: 'dashboard', action: 'navigate', description: 'Overview', group: 'Workspace' },
  { id: 'reply_assistant', label: 'Reply Assistant', icon: MessageSquare, origin: 'reply_assistant', action: 'navigate', description: 'AI text replies', group: 'Workspace' },
  { id: 'research', label: 'Research', icon: Microscope, origin: 'deepthink', action: 'navigate', description: 'Deep analysis', group: 'Workspace' },
  { id: 'build_mode', label: 'Build Mode', icon: Hammer, origin: 'tutorial', action: 'navigate', description: 'Builders', group: 'Workspace' },
  { id: 'tools', label: 'Tools', icon: Wrench, origin: 'tools', action: 'navigate', description: 'Utilities', group: 'Resources' },
  { id: 'system_rules', label: 'System Rules', icon: ShieldCheck, origin: 'prompt_vault', action: 'modal', description: 'Guardrails', group: 'Resources' },
  { id: 'storage', label: 'Storage', icon: Database, origin: 'storage', action: 'modal', description: 'Files', group: 'Resources' },
  { id: 'import', label: 'Import', icon: Upload, origin: 'import_clinician', action: 'modal', description: 'Data ingestion', group: 'Resources' },
];

// Layout constants - Stripe precision
const SIDEBAR_WIDTH_EXPANDED = 240;  // Narrower, more focused
const SIDEBAR_WIDTH_COLLAPSED = 56;  // Tighter collapsed state

const useGroupedNavigation = (items: NavItemType[]) => {
  return useMemo(() => {
    const groups: Record<string, NavItemType[]> = { 'Workspace': [], 'Resources': [] };
    items.forEach(item => { if (groups[item.group]) groups[item.group].push(item); });
    return groups;
  }, [items]);
};

const getModelIcon = (model?: string) => {
  const className = "w-full h-full";
  switch (model) {
    case 'claude': return <Brain className={`${className} text-[#9D5BD2]`} />;
    case 'gemini': return <Brain className={`${className} text-[#4C8BF5]`} />;
    default: return <Zap className={`${className} text-[#F6C568]`} />;
  }
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

const Modal: React.FC<{
  isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'medium' | 'large' | 'xlarge'
}> = ({ isOpen, onClose, title, children, size = 'large' }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      modalRef.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (isOpen) document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    medium: 'max-w-2xl h-[600px]',
    large: 'max-w-4xl h-[700px]',
    xlarge: 'max-w-6xl h-[85vh]',
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-opacity" onClick={onClose}>
      <div
        ref={modalRef}
        className={`relative flex flex-col ${THEME.modalBg} rounded-xl shadow-2xl border ${THEME.border} w-full overflow-hidden ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
      >
        <div className="flex items-center justify-between px-6 py-3.5 border-b ${THEME.border}">
          <h2 className="text-[15px] font-medium ${THEME.textActive} tracking-[-0.01em]">{title}</h2>
          <button onClick={onClose} className="${THEME.text} hover:${THEME.textActive} transition-colors p-1.5 rounded-md ${THEME.bgHover}">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const Tooltip: React.FC<{ children: React.ReactNode; content: string; disabled?: boolean }> = ({ children, content, disabled }) => {
  if (disabled) return <>{children}</>;
  return (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute left-full ml-2 px-2 py-1 bg-[#1a1a1a] border ${THEME.border} ${THEME.textActive} text-[11px] font-medium rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
        {content}
      </div>
    </div>
  );
};

const NavItem = memo(({ item, isActive, displayMode, onClick }: {
  item: NavItemType; isActive: boolean; displayMode: 'expanded' | 'collapsed' | 'mobile'; onClick: (item: NavItemType) => void;
}) => {
  const isCollapsed = displayMode === 'collapsed';
  const Icon = item.icon;

  return (
    <Tooltip content={item.label} disabled={!isCollapsed}>
      <button
        onClick={() => onClick(item)}
        className={`
          group flex items-center w-full relative
          ${isCollapsed ? 'justify-center px-0' : 'px-2.5'}
          py-1.5 rounded-md transition-all duration-200 ease-out
          ${isActive ? `${THEME.bgActive} ${THEME.textActive}` : `${THEME.text} ${THEME.bgHover}`}
          focus:outline-none ${THEME.focusRing}
        `}
      >
        {isActive && !isCollapsed && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] bg-[#0070f3] rounded-r" />
        )}

        <Icon
          size={18}
          strokeWidth={isActive ? 2 : 1.5}
          className={`
            transition-all duration-200 flex-shrink-0
            ${isActive ? THEME.accentMuted : `${THEME.text} group-hover:${THEME.textActive}`}
          `}
        />

        {!isCollapsed && (
          <span className="ml-2.5 text-[13px] truncate tracking-[-0.01em] font-medium">
            {item.label}
          </span>
        )}
      </button>
    </Tooltip>
  );
});
NavItem.displayName = 'NavItem';

// ============================================================================
// CONVERSATION LIST MODAL
// ============================================================================
const ConversationListModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  selectedSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onSessionDelete: (sessionId: string) => void;
  onSessionUpdate: (sessionId: string, title: string) => void;
}> = ({ isOpen, onClose, sessions, selectedSessionId, onSessionSelect, onSessionDelete, onSessionUpdate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'messages'>('recent');

  const filteredSessions = useMemo(() => {
    const filtered = sessions.filter(session =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort based on selected option
    return filtered.sort((a, b) => {
      if (sortBy === 'messages') {
        const aCount = a.messages?.length || 0;
        const bCount = b.messages?.length || 0;
        return bCount - aCount; // Descending order (most messages first)
      }
      // Default: sort by most recent (updated_at or created_at)
      const aDate = new Date(a.updated_at || a.createdAt).getTime();
      const bDate = new Date(b.updated_at || b.createdAt).getTime();
      return bDate - aDate;
    });
  }, [sessions, searchQuery, sortBy]);

  const handleEdit = (session: ChatSession) => {
    setEditingId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveEdit = (sessionId: string) => {
    if (editingTitle.trim()) {
      onSessionUpdate(sessionId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) {
      onSessionDelete(sessionId);
      if (sessionId === selectedSessionId) {
        onClose();
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Conversations" size="large">
      <div className="p-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]" size={18} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0a0a0a] border ${THEME.border} rounded-lg ${THEME.textActive} placeholder-[#666666] text-[13px] focus:outline-none ${THEME.focusRing}"
          />
        </div>

        {/* Sort Options */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSortBy('recent')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sortBy === 'recent'
                ? 'bg-[#3b82f6] text-white'
                : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
            }`}
          >
            Most Recent
          </button>
          <button
            onClick={() => setSortBy('messages')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sortBy === 'messages'
                ? 'bg-[#3b82f6] text-white'
                : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
            }`}
          >
            Most Messages
          </button>
        </div>

        {/* Session List */}
        <div className="space-y-2">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-[#a1a1aa]">
              <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
              <p>No conversations found</p>
            </div>
          ) : (
            filteredSessions.map(session => (
              <div
                key={session.id}
                className={`
                  group flex items-center gap-3 p-3 rounded-lg border transition-all
                  ${selectedSessionId === session.id 
                    ? 'bg-[#27272a] border-[#3b82f6]' 
                    : 'bg-[#09090b] border-white/5 hover:border-white/10 hover:bg-[#18181b]'}
                  cursor-pointer
                `}
                onClick={() => {
                  onSessionSelect(session.id);
                  onClose();
                }}
              >
                <MessageSquare size={18} className="text-[#a1a1aa] flex-shrink-0" />
                
                <div className="flex-1 min-w-0">
                  {editingId === session.id ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(session.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 bg-[#18181b] border border-[#3b82f6] rounded text-white text-sm focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="text-sm font-medium text-white truncate">
                        {session.title}
                      </div>
                      <div className="text-xs text-[#a1a1aa] truncate">
                        {new Date(session.updated_at).toLocaleDateString()} • {session.messages?.length || 0} messages
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingId === session.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveEdit(session.id);
                      }}
                      className="p-1.5 hover:bg-[#27272a] rounded text-green-500"
                    >
                      <Check size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(session);
                      }}
                      className="p-1.5 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-white"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(session.id, e)}
                    className="p-1.5 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

// ============================================================================
// SPACE SELECTOR WITH MANAGEMENT
// ============================================================================
const SpaceSelector: React.FC<SidebarProps & { displayMode: string }> = ({ 
  spaces, 
  currentSpaceId, 
  onSpaceSwitch, 
  onSpaceCreate,
  onSpaceUpdate,
  onSpaceDelete,
  displayMode 
}) => {
  const currentSpace = spaces.find(s => s.id === currentSpaceId);
  const isCollapsed = displayMode === 'collapsed';
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editingSpaceName, setEditingSpaceName] = useState('');

  if (!currentSpace) return null;

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    try {
      await onSpaceCreate(newSpaceName.trim());
      setNewSpaceName('');
      setIsCreating(false);
      toast.success('Space created');
    } catch (error) {
      toast.error('Failed to create space');
    }
  };

  const handleUpdateSpace = async (spaceId: string) => {
    if (!editingSpaceName.trim()) return;
    try {
      await onSpaceUpdate(spaceId, editingSpaceName.trim());
      setEditingSpaceId(null);
      setEditingSpaceName('');
      toast.success('Space updated');
    } catch (error) {
      toast.error('Failed to update space');
    }
  };

  const handleDeleteSpace = async (spaceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (spaces.length === 1) {
      toast.error('Cannot delete the last space');
      return;
    }
    if (window.confirm('Delete this space? All conversations will be lost.')) {
      try {
        await onSpaceDelete(spaceId);
        toast.success('Space deleted');
      } catch (error) {
        toast.error('Failed to delete space');
      }
    }
  };

  return (
    <div className="relative mb-6 px-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center gap-2.5
          ${THEME.bgElevated} ${THEME.bgHover} border ${THEME.border}
          rounded-lg transition-all duration-200
          ${isCollapsed ? 'p-2 justify-center' : 'px-2.5 py-2 justify-between'}
          focus:outline-none ${THEME.focusRing}
        `}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[#0070f3] flex items-center justify-center text-[10px] font-semibold text-white">
            {currentSpace.name.charAt(0).toUpperCase()}
          </div>
          {!isCollapsed && (
            <span className="text-[13px] font-medium ${THEME.textActive} truncate tracking-[-0.01em]">
              {currentSpace.name}
            </span>
          )}
        </div>
        {!isCollapsed && <ChevronDown size={12} className={`${THEME.text} transition-transform ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2} />}
      </button>

      {isOpen && !isCollapsed && (
        <div className="absolute top-full left-3 right-3 mt-2 bg-[#18181b] border border-white/10 rounded-lg shadow-xl z-20 p-2 max-h-80 overflow-y-auto custom-scrollbar">
          {/* Existing Spaces */}
          {spaces.map(s => (
            <div
              key={s.id}
              className={`
                group flex items-center gap-2 px-3 py-2 rounded transition-colors
                ${s.id === currentSpaceId ? 'bg-[#27272a]' : 'hover:bg-white/5'}
              `}
            >
              {editingSpaceId === s.id ? (
                <>
                  <input
                    type="text"
                    value={editingSpaceName}
                    onChange={(e) => setEditingSpaceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateSpace(s.id);
                      if (e.key === 'Escape') setEditingSpaceId(null);
                    }}
                    className="flex-1 px-2 py-1 bg-[#09090b] border border-[#3b82f6] rounded text-white text-sm focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdateSpace(s.id)}
                    className="p-1 hover:bg-[#27272a] rounded text-green-500"
                  >
                    <Check size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { onSpaceSwitch(s.id); setIsOpen(false); }}
                    className="flex-1 text-left text-sm text-[#a1a1aa] hover:text-white transition-colors truncate"
                  >
                    {s.name}
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingSpaceId(s.id);
                        setEditingSpaceName(s.name);
                      }}
                      className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-white"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteSpace(s.id, e)}
                      className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-red-500"
                      disabled={spaces.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Create New Space */}
          <div className="border-t border-white/10 mt-2 pt-2">
            {isCreating ? (
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="text"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSpace();
                    if (e.key === 'Escape') { setIsCreating(false); setNewSpaceName(''); }
                  }}
                  placeholder="Space name..."
                  className="flex-1 px-2 py-1 bg-[#09090b] border border-[#3b82f6] rounded text-white text-sm placeholder-[#a1a1aa] focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleCreateSpace}
                  className="p-1 hover:bg-[#27272a] rounded text-green-500"
                  disabled={!newSpaceName.trim()}
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => { setIsCreating(false); setNewSpaceName(''); }}
                  className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#3b82f6] hover:bg-white/5 rounded transition-colors"
              >
                <Plus size={14} />
                <span>New Space</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const Sidebar: React.FC<SidebarProps> = (props) => {
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const [modalState, setModalState] = useState({
    conversations: false,
    systemRules: false,
    promptCreator: false,
    files: false,
    import: false,
  });

  const groupedNav = useGroupedNavigation(NAVIGATION_SECTIONS);

  const handleNavClick = (item: NavItemType) => {
    switch (item.action) {
      case 'modal':
        switch (item.id) {
          case 'conversations':
            setModalState(prev => ({ ...prev, conversations: true }));
            break;
          case 'system_rules':
            setModalState(prev => ({ ...prev, systemRules: true }));
            break;
          case 'storage':
            setModalState(prev => ({ ...prev, files: true }));
            break;
          case 'import':
            setModalState(prev => ({ ...prev, import: true }));
            break;
        }
        break;
      case 'navigate':
        props.onNavigate?.(item.id);
        if (item.id === 'dashboard') props.onNavigateToDashboard?.();
        if (item.id === 'research') props.onNavigateToDeepThink?.();
        if (item.id === 'build_mode') props.onNavigateToTutorial?.();
        break;
      case 'action':
        if (item.id === 'signout') props.onSignOut();
        break;
    }
  };

  const sidebarClasses = `
    flex flex-col h-full
    ${THEME.bg} border-r ${THEME.border}
    transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
  `;

  return (
    <>
      {/* Mobile Overlay */}
      {props.isMobileOpen && (
        <div className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm lg:hidden" onClick={props.onMobileClose} />
      )}

      <aside
        className={`
          fixed lg:relative z-50 h-full
          ${sidebarClasses}
          ${props.isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ width: props.isSidebarCollapsed && !isMobile ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      >
        {/* 1. Header & Space Selector */}
        <div className="pt-5 flex flex-col flex-shrink-0">
          <SpaceSelector {...props} displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'} />
        </div>

        {/* 2. Primary Action (New Chat) */}
        <div className="px-3 mb-6">
          <button
            onClick={props.onSessionCreate}
            disabled={props.isProcessing}
            className={`
              flex items-center justify-center gap-2
              ${THEME.accent} ${THEME.accentHover} text-white
              h-8 w-full rounded-md
              font-medium text-[13px] tracking-[-0.01em] transition-all duration-200
              focus:outline-none ${THEME.focusRing}
              ${props.isSidebarCollapsed ? 'px-0' : 'px-3'}
              disabled:opacity-50 disabled:cursor-not-allowed
              active:scale-[0.98]
            `}
          >
            <Plus size={18} strokeWidth={2.5} />
            {!props.isSidebarCollapsed && <span>New Chat</span>}
          </button>
        </div>

{/* 3. Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-8 custom-scrollbar">
          {Object.entries(groupedNav).map(([group, items]) => (
            <div key={group}>
              {!props.isSidebarCollapsed && (
                <h4 className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#666666]">
                  {group}
                </h4>
              )}
              <div className="space-y-0.5">
                {items.map(item => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isActive={props.activeSection === item.id}
                    displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'}
                    onClick={handleNavClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 4. Processing Indicator (Stripe Terminal Style) */}
        {props.isProcessing && !props.isSidebarCollapsed && (
          <div className="px-2.5 py-3">
            <div className="${THEME.bgElevated} rounded-lg border ${THEME.border} p-2.5">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-mono ${THEME.accentMuted} uppercase tracking-wider">Processing</span>
                <span className="text-[10px] font-mono ${THEME.text}">{props.currentProgress}%</span>
              </div>
              <div className="h-[2px] w-full bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0070f3] transition-all duration-300"
                  style={{ width: `${props.currentProgress}%` }}
                />
              </div>
              {props.currentStep && (
                <div className="mt-1.5 text-[10px] ${THEME.textMuted} truncate font-mono">
                  {props.currentStep}
                </div>
              )}
              {props.currentModel && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="w-3 h-3">
                    {getModelIcon(props.currentModel)}
                  </div>
                  <span className="text-[10px] ${THEME.textMuted} font-mono uppercase">
                    {props.currentModel}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. Footer */}
        <div className="p-2.5 border-t ${THEME.border} space-y-0.5">
          <NavItem
            item={{ 
              id: 'settings', 
              label: 'Settings', 
              icon: Settings, 
              origin: 'settings', 
              action: 'navigate', 
              description: 'Settings', 
              group: 'Resources' 
            }}
            isActive={props.activeSection === 'settings'}
            displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'}
            onClick={handleNavClick}
          />
          <NavItem
            item={{ 
              id: 'signout', 
              label: 'Sign Out', 
              icon: LogOut, 
              origin: 'signout', 
              action: 'action', 
              description: 'Sign Out', 
              group: 'Resources' 
            }}
            isActive={false}
            displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'}
            onClick={handleNavClick}
          />
        </div>

        {/* Collapse Button (Desktop Only) */}
        {!isMobile && (
          <button
            onClick={props.onToggleSidebar}
            className="hidden lg:flex absolute top-5 -right-2.5 w-5 h-5 ${THEME.bgElevated} border ${THEME.border} rounded-full items-center justify-center ${THEME.text} hover:${THEME.textActive} shadow-lg transition-all duration-200 z-20 hover:scale-110"
            aria-label={props.isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {props.isSidebarCollapsed ? <ChevronRight size={10} strokeWidth={2.5} /> : <ChevronLeft size={10} strokeWidth={2.5} />}
          </button>
        )}
      </aside>

      {/* Modals */}
      <ConversationListModal
        isOpen={modalState.conversations}
        onClose={() => setModalState(prev => ({ ...prev, conversations: false }))}
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        onSessionSelect={props.onSessionSelect}
        onSessionDelete={props.onSessionDelete}
        onSessionUpdate={props.onSessionUpdate}
      />

      <PromptLibraryModal
        isOpen={modalState.systemRules}
        onClose={() => setModalState(prev => ({ ...prev, systemRules: false }))}
        onOpenCreator={() => {
          setModalState(prev => ({ ...prev, systemRules: false, promptCreator: true }));
        }}
        userId={props.userId || ''}
      />

      <PromptCreatorModal
        isOpen={modalState.promptCreator}
        onClose={() => setModalState(prev => ({ ...prev, promptCreator: false }))}
        onBack={() => {
          setModalState(prev => ({ ...prev, promptCreator: false, systemRules: true }));
        }}
        userId={props.userId || ''}
      />

      <FilesModal
        isOpen={modalState.files}
        onClose={() => setModalState(prev => ({ ...prev, files: false }))}
        onFileSelect={props.onFileSelect}
        userId={props.userId || ''}
      />

      <ClinicianImportModal
        isOpen={modalState.import}
        onClose={() => setModalState(prev => ({ ...prev, import: false }))}
        userId={props.userId || ''}
      />
    </>
  );
};

// ============================================================================
// EXPORT
// ============================================================================

export default Sidebar;