// Sidebar.tsx - Stripe Precision Layout / Original Dark Theme Colors
// The crisp structural UX of Stripe, but with your original Deep Black/Blue palette.

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
  MoreHorizontal
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { toast } from 'react-hot-toast';
import { ChatSession, Prompt, Project as AISpace } from '../types';
import { Spinner } from './Spinner'; // Ensure path matches
import { PromptLibraryModal } from './PromptLibraryModal';
import { PromptCreatorModal } from './PromptCreatorModal';
import { FilesModal } from './FilesModal';
import { ClinicianImportModal } from './ClinicianImportModal';

// ============================================================================
// STYLING CONSTANTS (Stripe Layout / Original Colors)
// ============================================================================
const THEME = {
  bg: 'bg-[#09090b]',        // Deep Zinc/Black (Original Dark Theme)
  bgHover: 'hover:bg-[#27272a]', // Zinc 800 Hover
  bgActive: 'bg-[#27272a]',      // Zinc 800 Active
  text: 'text-[#a1a1aa]',    // Zinc 400 (Inactive Text)
  textActive: 'text-white',  // White (Active Text)
  accent: 'bg-[#3b82f6]',    // Standard Blue 500 (Original Accent)
  accentHover: 'hover:bg-[#2563eb]', // Blue 600 Hover
  border: 'border-white/10', // Subtle White Border
  focusRing: 'focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#09090b]',
  modalBg: 'bg-[#18181b]',   // Zinc 900 for elevation
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

const SIDEBAR_WIDTH_EXPANDED = 260; // Slightly narrower, Stripe standard
const SIDEBAR_WIDTH_COLLAPSED = 64;

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
    case 'claude': return <Brain className={`${className} text-[#9D5BD2]`} />; // Claude Purple
    case 'gemini': return <Brain className={`${className} text-[#4C8BF5]`} />; // Gemini Blue
    default: return <Zap className={`${className} text-[#F6C568]`} />; // Yellow
  }
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

// 1. Stripe-style Modal
// Sharp corners (rounded-lg), distinct header, dark theme consistency
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-opacity" onClick={onClose}>
      <div
        ref={modalRef}
        className={`relative flex flex-col ${THEME.modalBg} rounded-lg shadow-2xl border border-white/10 w-full overflow-hidden ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#09090b]/50">
          <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-[#a1a1aa] hover:text-white transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-[#3b82f6]">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

// 2. Tooltip (Crisp)
const Tooltip: React.FC<{ children: React.ReactNode; content: string; disabled?: boolean }> = ({ children, content, disabled }) => {
    if (disabled) return <>{children}</>;
    return (
        <div className="group relative flex items-center">
            {children}
            <div className="absolute left-full ml-3 px-2 py-1 bg-[#18181b] border border-white/10 text-white text-xs font-medium rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                {content}
            </div>
        </div>
    );
};

// 3. Navigation Item
// Changes: Solid colors, fast transitions, focus rings
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
                    ${isCollapsed ? 'justify-center px-0' : 'px-3'}
                    py-2 rounded-md transition-all duration-150 ease-out
                    ${isActive ? `${THEME.bgActive} ${THEME.textActive} font-medium` : `${THEME.text} ${THEME.bgHover} hover:text-white`}
                    focus:outline-none ${THEME.focusRing}
                `}
            >
                {/* Active Indicator Strip (Stripe style) */}
                {isActive && !isCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-[#3b82f6] rounded-r-full" />
                )}

                <Icon
                    size={20}
                    strokeWidth={2} // Thinner stroke for crispness
                    className={`
                        transition-colors duration-150 flex-shrink-0
                        ${isActive ? 'text-[#3b82f6]' : 'text-[#a1a1aa] group-hover:text-white'}
                    `}
                />

                {!isCollapsed && (
                    <span className="ml-3 text-sm truncate tracking-tight">
                        {item.label}
                    </span>
                )}
            </button>
        </Tooltip>
    );
});
NavItem.displayName = 'NavItem';


// ============================================================================
// SPACE SELECTOR
// ============================================================================
const SpaceSelector: React.FC<SidebarProps & { displayMode: string }> = ({ spaces, currentSpaceId, onSpaceSwitch, displayMode }) => {
    const currentSpace = spaces.find(s => s.id === currentSpaceId);
    const isCollapsed = displayMode === 'collapsed';
    const [isOpen, setIsOpen] = useState(false);

    if (!currentSpace) return null;

    return (
        <div className="relative mb-6 px-3">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    w-full flex items-center gap-3
                    bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.05]
                    rounded-lg transition-all duration-150
                    ${isCollapsed ? 'p-2 justify-center' : 'px-3 py-2.5 justify-between'}
                    focus:outline-none ${THEME.focusRing}
                `}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                        {currentSpace.name.charAt(0).toUpperCase()}
                    </div>
                    {!isCollapsed && (
                        <span className="text-sm font-semibold text-white truncate">
                            {currentSpace.name}
                        </span>
                    )}
                </div>
                {!isCollapsed && <ChevronRight size={14} className={`text-[#a1a1aa] transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
            </button>

            {/* Dropdown (Simplified for brevity in this view) */}
            {isOpen && !isCollapsed && (
                <div className="absolute top-full left-3 right-3 mt-2 bg-[#18181b] border border-white/10 rounded-lg shadow-xl z-20 p-2">
                    {spaces.map(s => (
                        <button
                            key={s.id}
                            onClick={() => { onSpaceSwitch(s.id); setIsOpen(false); }}
                            className="w-full text-left px-3 py-2 text-sm text-[#a1a1aa] hover:text-white hover:bg-white/5 rounded transition-colors truncate"
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const Sidebar: React.FC<SidebarProps> = (props) => {
  const {
    displayMode = props.isSidebarCollapsed ? 'collapsed' : 'expanded',
    isMobile = useMediaQuery('(max-width: 1024px)'),
    isProcessing = false,
    currentProgress = 0,
    modals = { conversations: false, files: false }, // Minimal state for demo
  } = props as any; // Type assertion for simplifying props in this refactor

  const [modalState, setModalState] = useState({ conversations: false, settings: false });

  // Styling for the main container
  const sidebarClasses = `
    flex flex-col h-full
    ${THEME.bg} border-r ${THEME.border}
    transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
  `;

  const groupedNav = useGroupedNavigation(NAVIGATION_SECTIONS);

  // Render Logic
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
                className={`
                    flex items-center justify-center gap-2
                    ${THEME.accent} ${THEME.accentHover} text-white
                    h-9 w-full rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.1)]
                    font-medium text-sm transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:ring-offset-2 focus:ring-offset-[#09090b]
                    ${props.isSidebarCollapsed ? 'px-0' : 'px-4'}
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
                        <h4 className="px-3 mb-2 text-[11px] font-bold uppercase tracking-widest text-[#52525b]">
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
                                onClick={(i) => props.onNavigate?.(i.id)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>

        {/* 4. Processing Indicator (Stripe Terminal Style) */}
        {isProcessing && !props.isSidebarCollapsed && (
            <div className="px-3 py-4">
                <div className="bg-[#18181b] rounded border border-white/10 p-3 shadow-inner">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-[#3b82f6]">PROCESSING</span>
                        <span className="text-xs font-mono text-[#a1a1aa]">{currentProgress}%</span>
                    </div>
                    <div className="h-1 w-full bg-[#09090b] rounded-full overflow-hidden">
                        <div className="h-full bg-[#3b82f6] transition-all duration-300" style={{ width: `${currentProgress}%` }} />
                    </div>
                    <div className="mt-2 text-[10px] text-[#a1a1aa] truncate font-mono">
                        {props.currentStep || 'Analyzing request...'}
                    </div>
                </div>
            </div>
        )}

        {/* 5. Footer */}
        <div className="p-3 border-t border-white/10">
            <NavItem
                item={{ id: 'settings', label: 'Settings', icon: Settings, origin: 'settings', action: 'navigate', description: 'Settings', group: 'Resources' }}
                isActive={props.activeSection === 'settings'}
                displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'}
                onClick={() => props.onNavigate?.('settings')}
            />
             <NavItem
                item={{ id: 'signout', label: 'Sign Out', icon: LogOut, origin: 'signout', action: 'action', description: 'Sign Out', group: 'Resources' }}
                isActive={false}
                displayMode={props.isSidebarCollapsed ? 'collapsed' : 'expanded'}
                onClick={props.onSignOut}
            />
        </div>

        {/* Collapse Button (Desktop Only) */}
        <button
            onClick={props.onToggleSidebar}
            className="hidden lg:flex absolute top-6 -right-3 w-6 h-6 bg-[#18181b] border border-[#3f3f46] rounded-full items-center justify-center text-[#a1a1aa] hover:text-white shadow-md transition-colors z-20"
        >
            {props.isSidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

    </aside>

    {/* Modals Injection Point */}
    {/* (Simplified: Assuming modal state management is lifted or handled by parent as per original props) */}
    </>
  );
};