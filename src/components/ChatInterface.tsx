import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, KeyboardEvent as ReactKeyboardEvent, Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown, Trash2, RefreshCw, AlertCircle, Check,
  X, Edit2, Code2, Zap, Loader2, ArrowDown,
  MoreVertical, Download, Settings, Search as SearchIcon, Globe
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// MARK: Internal Hooks
// Note: Ensure these paths are correct for your project structure
import { useAiRouterChat } from '../hooks/useAiRouterChat';
import { useCodeSnippets } from '../hooks/useCodeSnippets';
import { useContextManager } from '../hooks/useContextManager';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useOnboardingState } from '../hooks/useOnboardingState';

// MARK: Components
import { MessageList } from './MessageList';
import { FileUploadPreview } from './FileUploadPreview';
import { ChatInputArea } from './ChatInputArea';
import { ContextBanner } from './ContextBanner';
import { SpaceSelector } from './SpaceSelector';
import { SearchResults } from './SearchResults';

// MARK: Utilities and Services
import { uploadImage } from '../lib/imageStorageService';
import { MODEL_CONFIGS, AiModelKey } from '../config/models';
import { generateTempId, triggerDownload, getFileExtension, cn } from '../lib/utils';
import { validateTokenLimit } from '../services/contextService';
import {
  exportWithWorker,
  generateFilename,
  downloadFile,
  getFileSizeEstimate,
} from '../utils/exportUtils';
import { trackExport } from '../lib/analytics';
import { getSearchService, detectSearchIntent, SearchIntent } from '../services/searchService';

// MARK: Types
import { StoredFile, SavedSchema, ImageAttachment, CodeSnippet, LocalFileAttachment, ChatMessage } from '../types';

// ============================================================================
// LAZY LOADED COMPONENTS (Performance Optimization)
// ============================================================================

const StorageManager = lazy(() => import('./StorageManager').then(module => ({ default: module.StorageManager })));
const CodeSnippetSidebar = lazy(() => import('./CodeSnippetSidebar').then(module => ({ default: module.CodeSnippetSidebar })));
const ContextEditorModal = lazy(() => import('./ContextEditorModal').then(module => ({ default: module.ContextEditorModal })));
const SpaceSettingsModal = lazy(() => import('./SpaceSettingsModal').then(module => ({ default: module.SpaceSettingsModal })));
const SpacesIntroModal = lazy(() => import('./SpacesIntroModal').then(module => ({ default: module.SpacesIntroModal })));


// ============================================================================
// MARK: CONFIGURATION & TYPES
// ============================================================================

interface SaveSchemaArgs {
  name: string;
  content: string | Record<string, unknown> | unknown[];
  format?: string;
  description?: string;
  source_file?: string;
}

// Type guard for robust validation of AI-generated arguments
function isSaveSchemaArgs(args: unknown): args is SaveSchemaArgs {
  if (typeof args !== 'object' || args === null) return false;
  const record = args as Record<string, unknown>;
  return typeof record.name === 'string' && record.name.length > 0 && record.content !== undefined;
}

// Configuration for validation and UX constraints
const MAX_IMAGE_SIZE_MB = 10;
const MAX_FILE_SIZE_MB = 50;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Simplified prompts for the minimalist "chip" style empty state
const SUGGESTED_PROMPTS = [
  { title: "Organize Thoughts", prompt: "Take these rough notes/context and organize them into a structured hierarchy or outline (like PARA method)." },
  { title: "Summarize Knowledge", prompt: "Summarize the key takeaways from the provided text and explain how the concepts relate to one another." },
  { title: "Extract Action Items", prompt: "Review the content and extract a clear list of actionable tasks, deadlines, and next steps." },
  { title: "Brainstorm Ideas", prompt: "Act as a thinking partner. Expand on the current topic, suggest alternative perspectives, and generate new ideas." }
];

// *** NEW: Types for Agentive Search State ***
// 'auto' = Use intent detection. 'manual' = Force ON for next message. 'off' = Force OFF for next message.
type SearchMode = 'auto' | 'manual' | 'off';
// Tracks localized processing steps (distinct from backend steps)
type LocalProcessingStep = 'detecting_intent' | 'searching_web' | 'uploading' | null;


// ============================================================================
// MARK: UTILITY HOOKS
// ============================================================================

const useClickOutside = (ref: React.RefObject<HTMLElement> | React.RefObject<HTMLElement>[], handler: () => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const refs = Array.isArray(ref) ? ref : [ref];
      const clickedInside = refs.some(r => r.current && r.current.contains(event.target as Node));
      if (!clickedInside) {
        handler();
      }
    };
    // Optimization: Use capture phase (true) for better reliability
    document.addEventListener('mousedown', listener, true);
    document.addEventListener('touchstart', listener, true);
    return () => {
      document.removeEventListener('mousedown', listener, true);
      document.removeEventListener('touchstart', listener, true);
    };
  }, [ref, handler]);
};


// ============================================================================
// MARK: UTILITY COMPONENTS (Memoized for performance)
// ============================================================================

const LoadingFallback = React.memo(() => (
  <div className="flex items-center justify-center h-full w-full" role="status" aria-label="Loading">
    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
  </div>
));

const ScrollToBottomButton: React.FC<{ onClick: () => void }> = React.memo(({ onClick }) => (
  <motion.button
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    transition={{ duration: 0.2 }}
    onClick={onClick}
    className="absolute bottom-5 right-5 z-10 p-3 bg-zinc-800/70 hover:bg-zinc-700/80 rounded-full shadow-lg hover:shadow-xl transition-all duration-150 backdrop-blur-lg border border-white/10 touch-target focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    aria-label="Scroll to bottom"
    title="Scroll to bottom"
    whileTap={{ scale: 0.90 }}
  >
    <ArrowDown className="w-5 h-5 text-zinc-200" />
  </motion.button>
));

// *** ENHANCEMENT: Granular Processing Indicator ***
const ProcessingIndicator: React.FC<{ step: string; progress: number; modelName: string | null; icon?: React.ReactNode }> = React.memo(({ step, progress, modelName, icon }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 10 }}
    transition={{ duration: 0.2 }}
    className="flex items-center gap-3 px-4 py-3 bg-zinc-900/80 backdrop-blur-sm border border-white/[0.08] rounded-xl shadow-md mx-auto my-4 max-w-md"
    role="status"
    aria-label="Processing Status"
  >
    {/* Use custom icon if provided, otherwise default spinner */}
    {icon ? icon : <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
    <div className="flex-1">
      <p className="text-sm font-medium text-zinc-200">
        {step || 'Processing...'} {modelName && <span className='text-zinc-400 font-normal'>({modelName})</span>}
      </p>
      {/* Only show progress bar if progress is meaningful */}
      {progress > 0 && (
        <div
          className="w-full bg-zinc-700 rounded-full h-1 mt-1.5 overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-blue-500 h-1 transition-all duration-500" style={{ width: `${Math.max(10, progress)}%` }} />
        </div>
      )}
    </div>
  </motion.div>
));

const ImageLightbox: React.FC<{ imageUrl: string; onClose: () => void }> = React.memo(({ imageUrl, onClose }) => {
  const lightboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    lightboxRef.current?.focus();
  }, []);

  return (
    <motion.div
      ref={lightboxRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 ios-safe-top ios-safe-bottom"
      onClick={onClose}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
    >
      <motion.img
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        transition={{ duration: 0.15 }}
        src={imageUrl}
        alt="Enlarged view"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors touch-target ios-safe-top-padding focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <X className="w-6 h-6" />
      </button>
    </motion.div>
  );
});


// ============================================================================
// MARK: COMPONENT DEFINITION
// ============================================================================

interface ChatInterfaceProps {
  sessionId: string | null;
  sessionName: string;
  files: StoredFile[];
  onSaveSchema: (name: string, content: any, sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onProgressUpdate?: (progress: number, step: string, model: string) => void;
  accessToken: string | null;
  userId: string | null;
  onRegisterFileCallback?: (callback: (files: File[]) => void) => void;
  onRegisterStorageCallback?: (callback: () => void) => void;
  onUpdateSessionName?: (sessionId: string, newName: string) => void;
  userName?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  sessionId,
  sessionName,
  files,
  onSaveSchema,
  onDeleteSession,
  onProgressUpdate,
  accessToken,
  userId,
  onRegisterFileCallback,
  onRegisterStorageCallback,
  onUpdateSessionName,
  userName,
}) => {

  // ==========================================================================
  // MARK: STATE & REFS
  // ==========================================================================

  const [selectedModel, setSelectedModel] = useState<AiModelKey>('auto');
  const [activeModel, setActiveModel] = useState<AiModelKey | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<LocalFileAttachment[]>([]);
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);

  const [showStorage, setShowStorage] = useState(false);
  const [showCodeSnippets, setShowCodeSnippets] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);

  const [showContextEditor, setShowContextEditor] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [showSpaceSettings, setShowSpaceSettings] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [showSpacesIntro, setShowSpacesIntro] = useState(false);

  // *** REFACTORED: Search and Processing State ***
  // Default to Agentive mode ('auto')
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [searchResults, setSearchResults] = useState<any>(null);
  // Unified local processing state
  const [localProcessingStep, setLocalProcessingStep] = useState<LocalProcessingStep>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesWrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const storageButtonRef = useRef<HTMLButtonElement>(null);

  const isSavingTitle = useRef(false);
  const latestProviderRef = useRef('unknown');
  // Optimization: Use ref to track current attachments for cleanup effects
  const imageAttachmentsRef = useRef(imageAttachments);

  // ==========================================================================
  // MARK: HOOKS
  // ==========================================================================

  const contextEnabled = useFeatureFlag('pinned_context');
  const exportEnabled = useFeatureFlag('export_conversation');
  // *** NEW: Feature flag for the Agentive system itself ***
  const agentiveSearchEnabled = useFeatureFlag('agentive_web_search');

  const {
    context,
    syncing: contextSyncing,
    saveContext,
    toggleActive,
  } = useContextManager(userId || undefined);

  const { hasSeenSpacesIntro, isLoading: isLoadingOnboarding, markSpacesIntroAsSeen } = useOnboardingState(userId || undefined);

  useClickOutside([dropdownRef, mobileMenuRef, desktopMenuRef], () => {
    if (showModelDropdown) {
      setShowModelDropdown(false);
      setFocusedModelIndex(-1);
    }
    setShowMobileMenu(false);
    setShowDesktopMenu(false);
  });

  // ==========================================================================
  // MARK: CORE CHAT & SNIPPET LOGIC
  // ==========================================================================

  const handleActionRequest = useCallback(
    async (action: string, args: unknown, messageId: string, appendMessage: Function) => {
      if (action === 'save_schema' && sessionId) {
        if (!isSaveSchemaArgs(args)) {
          const errorMsg = 'Schema save failed: Invalid arguments provided by AI (missing name or content).';
          toast.error(errorMsg);
          appendMessage({
            id: generateTempId(),
            role: 'system',
            content: `Action \`${action}\` failed: ${errorMsg} Please ensure 'name' (string) and 'content' (object/string) are provided.`,
            metadata: { action_status: 'failed', related_message_id: messageId },
            createdAt: new Date().toISOString(),
          });
          return;
        }

        const { name, content, format, description, source_file } = args;

        try {
          let contentString: string;
          let parsedContent: any;

          if (typeof content === 'string') {
            contentString = content;
            try {
              parsedContent = JSON.parse(content);
              contentString = JSON.stringify(parsedContent, null, 2);
            } catch (e) {
              parsedContent = { raw_content: content };
            }
          } else if (typeof content === 'object' && content !== null) {
            parsedContent = content;
            contentString = JSON.stringify(content, null, 2);
          } else {
            throw new Error(`Invalid content type (${typeof content})`);
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const safeFileName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
          const extension = getFileExtension(format || 'json');
          const fileName = `${safeFileName}_${timestamp}.${extension}`;

          triggerDownload(contentString, fileName);

          const schemaWithMetadata = {
            content: parsedContent,
            _metadata: {
              name,
              format: format || 'unknown',
              description: description || 'No description provided.',
              source_file: source_file || 'Unknown source',
              extracted_at: new Date().toISOString(),
              extracted_by_model: latestProviderRef.current
            }
          };

          await onSaveSchema(name, schemaWithMetadata, sessionId);
          toast.success(`Schema "${name}" saved & downloaded.`);

        } catch (e) {
          console.error('Error during save_schema action:', e);
          const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred';
          toast.error(`Failed to process schema save action: ${errorMsg}`);
          appendMessage({
            id: generateTempId(),
            role: 'system',
            content: `Action \`${action}\` failed: An internal error occurred while saving the schema. Error: ${errorMsg}`,
            metadata: { action_status: 'error', related_message_id: messageId },
            createdAt: new Date().toISOString(),
          });
        }
      }
    },
    [sessionId, onSaveSchema]
  );

  const {
    messages,
    sendMessage,
    isSending,
    isLoadingHistory,
    currentProgress,
    currentStep,
    error,
    clearMessages,
    retryCount,
    isRetrying,
  } = useAiRouterChat({
    sessionId,
    accessToken,
    userId,
    files: files || [],
    onActionRequest: handleActionRequest,
    selectedModel,
    spaceId: selectedSpaceId,
  }) as any;

  const {
    snippets,
    isLoading: isLoadingSnippets,
    isExtracting,
    toggleBookmark,
  } = useCodeSnippets({
    sessionId,
    userId,
    messages,
  });

  // ==========================================================================
  // MARK: MEMOIZED VALUES & EFFECTS
  // ==========================================================================

  const currentModelConfig = useMemo(() => MODEL_CONFIGS[selectedModel], [selectedModel]);
  const activeModelConfig = useMemo(() => activeModel ? MODEL_CONFIGS[activeModel] : null, [activeModel]);
  const modelKeys = useMemo(() => Object.keys(MODEL_CONFIGS) as AiModelKey[], []);

  const isUploading = useMemo(() => imageAttachments.some(img => img.isUploading), [imageAttachments]);
  const isLocalProcessing = useMemo(() => localProcessingStep !== null, [localProcessingStep]);

  // Determine if the AI backend is actively generating a response
  const isProcessing = useMemo(() => {
    if (!isSending) return false;
    const lastMessage = messages[messages.length - 1];
    // If the last message is from the user, the AI is processing/generating
    return lastMessage && lastMessage.role === 'user';
  }, [isSending, messages]);

  // Keep the ref updated with the latest state
  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  // Performance: Cleanup Blob URLs on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Use the ref's current value during cleanup
      imageAttachmentsRef.current.forEach(att => {
        if (att.url && att.url.startsWith('blob:') && att.file) {
          URL.revokeObjectURL(att.url);
        }
      });
    };
  }, []);

  useEffect(() => {
    const lastAiMessage = messages.slice().reverse().find(m => m.role === 'assistant') as ChatMessage | undefined;
    if (lastAiMessage?.metadata?.provider) {
      const provider = lastAiMessage.metadata.provider;
      latestProviderRef.current = provider;
      const matchedKey = modelKeys.find(key => MODEL_CONFIGS[key].providerKey === provider);
      if (matchedKey) setActiveModel(matchedKey);
      else setActiveModel(null);
    } else if (messages.length === 0) {
      setActiveModel(null);
      latestProviderRef.current = 'unknown';
    }
  }, [messages, modelKeys]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (showModelDropdown) {
      const currentIndex = modelKeys.indexOf(selectedModel);
      setFocusedModelIndex(currentIndex);
    } else {
      setFocusedModelIndex(-1);
    }
  }, [showModelDropdown, selectedModel, modelKeys]);

  useEffect(() => {
    if (!isLoadingOnboarding && !hasSeenSpacesIntro && userId) {
      // Preload the modal component
      import('./SpacesIntroModal');
      const timer = setTimeout(() => setShowSpacesIntro(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoadingOnboarding, hasSeenSpacesIntro, userId]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && showStorage) {
        event.preventDefault();
        handleStorageClick();
      }
    };
    if (showStorage) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showStorage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (onProgressUpdate && isSending) {
      const modelName = activeModelConfig?.providerKey || latestProviderRef.current || 'system';
      const mappedModel = ['claude', 'gemini', 'gpt'].some(prefix => modelName.startsWith(prefix)) ? modelName : 'system';
      onProgressUpdate(currentProgress, currentStep, mappedModel);
    }
  }, [currentProgress, currentStep, isSending, onProgressUpdate, activeModelConfig]);

  // ==========================================================================
  // MARK: SCROLL MANAGEMENT
  // ==========================================================================

  const checkScrollPosition = useCallback(() => {
    const wrapper = messagesWrapperRef.current;
    if (!wrapper) return;
    const nearBottom = wrapper.scrollHeight - wrapper.scrollTop <= wrapper.clientHeight + 150;
    if (nearBottom !== isNearBottom) setIsNearBottom(nearBottom);
  }, [isNearBottom]);

  useEffect(() => {
    const wrapper = messagesWrapperRef.current;
    if (wrapper) {
      if (!isLoadingHistory) checkScrollPosition();
      wrapper.addEventListener('scroll', checkScrollPosition, { passive: true });
      return () => wrapper.removeEventListener('scroll', checkScrollPosition);
    }
  }, [checkScrollPosition, isLoadingHistory]);

  useLayoutEffect(() => {
    if (isLoadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      setIsNearBottom(true);
      return;
    }
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isLoadingHistory, isNearBottom]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ==========================================================================
  // MARK: HANDLERS
  // ==========================================================================

  const handleTitleEdit = useCallback(() => {
    setEditedTitle(sessionName);
    setIsEditingTitle(true);
  }, [sessionName]);

  const handleTitleSave = useCallback(async () => {
    if (isSavingTitle.current) return;
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle || trimmedTitle === sessionName) {
      setIsEditingTitle(false);
      return;
    }
    if (sessionId && onUpdateSessionName) {
      isSavingTitle.current = true;
      const loadingId = toast.loading('Updating title...');
      try {
        await onUpdateSessionName(sessionId, trimmedTitle);
        toast.success('Session name updated', { id: loadingId });
        setIsEditingTitle(false);
      } catch (error) {
        toast.error('Failed to update session name', { id: loadingId });
      } finally {
        isSavingTitle.current = false;
      }
    }
  }, [editedTitle, sessionName, sessionId, onUpdateSessionName]);

  const handleTitleCancel = useCallback(() => {
    setIsEditingTitle(false);
    setEditedTitle('');
  }, []);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleTitleCancel();
    }
  }, [handleTitleSave, handleTitleCancel]);

  const handleImageClick = useCallback((imageUrl: string) => {
    setActiveLightboxImage(imageUrl);
  }, []);

  const handleModelSelect = useCallback((key: AiModelKey) => {
    setSelectedModel(key);
    setShowModelDropdown(false);
    setFocusedModelIndex(-1);
    modelButtonRef.current?.focus();
  }, []);

  const handleDropdownKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!showModelDropdown) return;
    const maxIndex = modelKeys.length - 1;
    let newIndex = focusedModelIndex;

    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); newIndex = focusedModelIndex < maxIndex ? focusedModelIndex + 1 : 0; break;
      case 'ArrowUp': event.preventDefault(); newIndex = focusedModelIndex > 0 ? focusedModelIndex - 1 : maxIndex; break;
      case 'Home': event.preventDefault(); newIndex = 0; break;
      case 'End': event.preventDefault(); newIndex = maxIndex; break;
      case 'Escape': event.preventDefault(); setShowModelDropdown(false); setFocusedModelIndex(-1); modelButtonRef.current?.focus(); break;
      case 'Tab': setShowModelDropdown(false); setFocusedModelIndex(-1); break;
      default: return;
    }
    if (newIndex !== focusedModelIndex) setFocusedModelIndex(newIndex);
  }, [showModelDropdown, focusedModelIndex, modelKeys]);

  const handleSchemaSelect = useCallback((schema: SavedSchema) => {
    toast.info(`Schema "${schema.name}" selected (TODO: Implement usage)`);
  }, []);

  const handleStorageClick = useCallback(() => {
    if (!showStorage) import('./StorageManager'); // Preload
    setShowStorage(prev => {
      const newState = !prev;
      if (!newState && storageButtonRef.current) {
        // Refocus the button after closing the modal for A11y
        setTimeout(() => storageButtonRef.current?.focus(), 50);
      }
      return newState;
    });
  }, [showStorage]);

  const handleToggleCodeSnippets = useCallback(() => {
    if (!showCodeSnippets) import('./CodeSnippetSidebar'); // Preload
    setShowCodeSnippets(prev => !prev);
  }, [showCodeSnippets]);

  const handleCopySnippet = useCallback(async (snippet: CodeSnippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      toast.success('Code copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy code');
    }
  }, []);

  const handleDownloadSnippet = useCallback((snippet: CodeSnippet) => {
    const extension = getFileExtension(snippet.language);
    const fileName = snippet.userDefinedName || snippet.detectedFileName || `snippet_${snippet.orderIndex + 1}`;
    const fullFileName = fileName.includes('.') ? fileName : `${fileName}.${extension}`;
    triggerDownload(snippet.content, fullFileName);
    toast.success(`Downloaded ${fullFileName}`);
  }, []);

  const handleNavigateToMessage = useCallback((messageId: string) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.classList.add('highlight-flash');
      setTimeout(() => messageElement.classList.remove('highlight-flash'), 2000);
      if (window.innerWidth < 768) setShowCodeSnippets(false);
    } else {
      toast.error('Message not found in current view');
    }
  }, []);

  const handleDeleteSession = useCallback(() => {
    if (sessionId && onDeleteSession) {
      if (window.confirm("Are you sure you want to delete this entire session? This cannot be undone.")) {
        onDeleteSession(sessionId);
      }
    }
    setShowDesktopMenu(false);
    setShowMobileMenu(false);
  }, [sessionId, onDeleteSession]);

  // ==========================================================================
  // MARK: FILE & SENDING LOGIC
  // ==========================================================================

  const handleFileSelect = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];
    newFiles.forEach(file => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) errors.push(`"${file.name}" exceeds ${MAX_FILE_SIZE_MB}MB.`);
      else validFiles.push(file);
    });
    if (errors.length > 0) toast.error(`Could not attach files: ${errors.join(' ')}`);
    if (validFiles.length > 0) {
      const newAttachments: LocalFileAttachment[] = validFiles.map(file => ({ tempId: generateTempId(), file }));
      setAttachedFiles((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleImageSelect = useCallback((newImages: File[]) => {
    const validImages: File[] = [];
    const errors: string[] = [];
    newImages.forEach(img => {
      if (img.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) errors.push(`Image exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
      else if (!SUPPORTED_IMAGE_TYPES.includes(img.type)) errors.push(`Unsupported type (${img.type}).`);
      else validImages.push(img);
    });
    if (errors.length > 0) toast.error(`Could not attach images: ${errors.join(' ')}`);
    if (validImages.length > 0) {
      const newAttachments: ImageAttachment[] = validImages.map(img => {
        const filename = img.name || `pasted-image-${Date.now()}.${img.type.split('/')[1] || 'png'}`;
        return {
          tempId: generateTempId(), file: img, url: URL.createObjectURL(img),
          filename, size: img.size, mime_type: img.type, isUploading: false
        };
      });
      setImageAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleRemoveFile = useCallback((tempId: string) => {
    setAttachedFiles((prev) => prev.filter((att) => att.tempId !== tempId));
  }, []);

  const handleRemoveImage = useCallback((tempId: string) => {
    setImageAttachments((prev) => {
      const attachmentToRemove = prev.find(att => att.tempId === tempId);
      if (attachmentToRemove?.isUploading) {
        toast.error("Cannot remove image while uploading.");
        return prev;
      }
      // Cleanup Blob URL
      if (attachmentToRemove?.url && attachmentToRemove.url.startsWith('blob:') && attachmentToRemove.file) {
        URL.revokeObjectURL(attachmentToRemove.url);
      }
      return prev.filter((att) => att.tempId !== tempId);
    });
  }, []);

  const handleClearAttachments = useCallback(() => {
    if (isUploading) {
      toast.error("Please wait for uploads to complete before clearing.");
      return;
    }
    setAttachedFiles([]);
    setImageAttachments((prev) => {
      // Cleanup Blob URLs
      prev.forEach(att => {
        if (att.url && att.url.startsWith('blob:') && att.file) URL.revokeObjectURL(att.url);
      });
      return [];
    });
  }, [isUploading]);

  // Robust image upload handler
  const uploadSingleImage = useCallback(async (attachment: ImageAttachment): Promise<string | null> => {
    if (!userId || !sessionId) return null;
    if (attachment.id) return attachment.id;
    if (!attachment.file) return null;

    const updateAttachment = (tempId: string, updates: Partial<ImageAttachment>) => {
      setImageAttachments(prev => prev.map(att => att.tempId === tempId ? { ...att, ...updates } : att));
    };

    updateAttachment(attachment.tempId, { uploadProgress: 10, isUploading: true });

    try {
      const result = await uploadImage(attachment.file, userId, sessionId);
      if (result.success && result.image) {
        updateAttachment(attachment.tempId, {
          uploadProgress: 100, id: result.image.id, url: result.image.signed_url, file: undefined, isUploading: false,
        });
        return result.image.id;
      } else {
        const errorMsg = result.error || 'Upload failed.';
        updateAttachment(attachment.tempId, { uploadError: errorMsg, uploadProgress: 0, isUploading: false });
        toast.error(`Failed to upload ${attachment.filename}: ${errorMsg}`);
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload exception.';
      updateAttachment(attachment.tempId, { uploadError: errorMsg, uploadProgress: 0, isUploading: false });
      toast.error(`Error uploading ${attachment.filename}: ${errorMsg}`);
      return null;
    }
  }, [userId, sessionId]);

  const handleRetryUpload = useCallback(async (tempId: string) => {
    // Use the ref to access the current state safely in async callback
    const attachmentToRetry = imageAttachmentsRef.current.find(att => att.tempId === tempId);
    if (attachmentToRetry && attachmentToRetry.uploadError && !attachmentToRetry.isUploading && attachmentToRetry.file) {
      await uploadSingleImage(attachmentToRetry);
    }
  }, [uploadSingleImage]);

  // Core sending logic (Refined failure handling)
  // --- Core Sending Logic (The Orchestrator) ---
  const handleSendMessage = useCallback(
    async (content: string) => {
      // 1. Pre-flight checks
      if (isSending || isLocalProcessing || (!content.trim() && attachedFiles.length === 0 && imageAttachments.length === 0)) return;
      if (isUploading) {
        toast.error("Please wait for current uploads to finish.");
        return;
      }

      let finalContent = content;
      let triggerSource: 'auto' | 'manual' | 'none' = 'none';
      let intentComplexity: 'high' | 'low' = 'low';

      // 2. Agentive Search Routing (The "Porsche Engine" Logic)
      if (content.trim() && accessToken && agentiveSearchEnabled) {
        let shouldSearch = false;

        // Skip auto-search for code content or very long messages
        const hasCodeBlocks = /```[\s\S]*?```/.test(content);
        const isVeryLong = content.length > 1000;
        const hasFileAttachments = attachedFiles.length > 0 || imageAttachments.length > 0;

        if (searchMode === 'manual') {
          shouldSearch = true;
          triggerSource = 'manual';
        } else if (searchMode === 'auto') {
          // Skip auto-search if message contains code, is very long, or has file attachments
          if (hasCodeBlocks || isVeryLong || hasFileAttachments) {
            console.log('[Agentive Search] Skipping auto-search: code blocks, long message, or file attachments detected');
            shouldSearch = false;
          } else {
            // Run the intent detection (Cascade Pattern implementation assumed in detectSearchIntent)
            setLocalProcessingStep('detecting_intent');
            console.log('[Agentive Search] Detecting search intent for query:', content);

            // Pass previous messages for context-aware detection
            const intent: SearchIntent = await detectSearchIntent(content, messages);
            console.log('[Agentive Search] Intent detection result:', intent);

            // Clear intent detection step quickly
            // Use functional update to ensure we only clear if it hasn't changed
            setLocalProcessingStep(currentStep => currentStep === 'detecting_intent' ? null : currentStep);

            if (intent.requiresSearch) {
              shouldSearch = true;
              triggerSource = 'auto';
              intentComplexity = intent.complexity || 'low';
              console.log('[Agentive Search] Auto-triggering web search with complexity:', intentComplexity);
              // Provide subtle UI feedback for auto-trigger
              toast('Smart Search activated.', { icon: <Globe className='w-4 h-4 text-blue-500' />, duration: 1500 });
            } else {
              console.log('[Agentive Search] No search needed for this query');
            }
          }
        }

        // Execute Search if triggered
        if (shouldSearch) {
          setLocalProcessingStep('searching_web');
          setSearchResults(null);

          try {
            const searchService = getSearchService(accessToken);

            // Validate and truncate query length (max 800 characters)
            const MAX_QUERY_LENGTH = 800;
            let searchQuery = content;
            if (searchQuery.length > MAX_QUERY_LENGTH) {
              console.warn(`[Agentive Search] Query too long (${searchQuery.length} chars), truncating to ${MAX_QUERY_LENGTH}`);
              searchQuery = searchQuery.substring(0, MAX_QUERY_LENGTH);
              toast.info(`Query truncated to ${MAX_QUERY_LENGTH} characters for search`, { duration: 2000 });
            }

            // Dynamic Model Selection: Use Pro if manually requested OR if auto-detected intent is complex.
            const searchModel = (triggerSource === 'manual' || intentComplexity === 'high') ? 'sonar-pro' : 'sonar';

            const searchResponse = await searchService.search({
              query: searchQuery,
              session_id: sessionId,
              conversation_id: sessionId,
              max_results: 5,
              model: searchModel,
              trigger_source: triggerSource,
            });

            // Update UI with results (Optimistic UI)
            setSearchResults({
              summary: searchResponse.search_summary,
              references: searchService.formatSearchResults(searchResponse.references),
              metadata: {
                query_id: searchResponse.metadata?.query_id || 'unknown',
                search_triggered: true,
                search_triggered_by: triggerSource,
                model_used: searchResponse.metadata?.model_used || searchModel,
                sources_count: searchResponse.references.length,
                total_cost_usd: searchResponse.metadata?.cost_usd || 0,
                latency_ms: searchResponse.metadata?.latency_ms || 0,
                cache_hit: searchResponse.metadata?.cache_hit || false,
                data_freshness: searchResponse.data_freshness
              }
            });

            // Inject search context into the AI prompt
            if (searchResponse.search_summary) {
              // The prompt structure ensures the AI prioritizes the fresh data
              const context = `\n\n<web_search_context>\n[Current Web Search Results - ${new Date().toLocaleDateString()}]\n\n${searchResponse.search_summary}\n\nSources: ${searchResponse.references.map((r: any) => r.url).join(', ')}\n</web_search_context>\n\n[INSTRUCTION: Use the above context to answer the user's request. Integrate the findings naturally and ensure citations are present.]`;
              finalContent += context;
            }
          } catch (error) {
            console.error('Search error:', error);
            // Better error messaging - don't block the AI response
            const errorMsg = error instanceof Error ? error.message : 'Web search unavailable';
            if (errorMsg.includes('Quota exceeded')) {
              toast.error('Search quota exceeded. Answering from knowledge base.', { duration: 3000 });
            } else if (errorMsg.includes('unavailable') || errorMsg.includes('503')) {
              toast('Web search temporarily unavailable. Answering from knowledge base.', { icon: '⚠️', duration: 3000 });
            } else {
              toast('Web search failed. Answering from knowledge base.', { icon: '⚠️', duration: 2500 });
            }
            // Clear search results on error
            setSearchResults(null);
          }
        }
      }

      // 3. Global Context Injection
      if (contextEnabled && context && context.is_active && context.context_content) {
        try {
          // Validate the *entire* content (including potential search context)
          const validation = await validateTokenLimit(context.context_content, finalContent, selectedModel);
          if (!validation.isValid) {
            toast.error(`Token limit exceeded (${validation.totalTokens}/${validation.maxTokens}). Pinned context ignored.`);
          } else {
            // Inject the context using XML-like tags for clear delineation
            finalContent = `<pinned_context>\n${context.context_content}\n</pinned_context>\n\n---\n\n` + finalContent;
          }
        } catch (error) {
          console.error('Error validating token limit:', error);
          toast.error('Could not validate token limits. Sending without global context.');
        }
      }

      // 4. Image Uploads
      let uploadedImageIdsList: string[] = [];
      let uploadFailures = false;
      const imagesToUpload = imageAttachments.filter(att => !att.id && att.file);

      if (imagesToUpload.length > 0 && userId && sessionId) {
        setLocalProcessingStep('uploading');
        const uploadPromises = imagesToUpload.map(attachment => uploadSingleImage(attachment));
        const results = await Promise.all(uploadPromises);
        uploadedImageIdsList = results.filter((id): id is string => id !== null);

        if (uploadedImageIdsList.length < imagesToUpload.length) {
          uploadFailures = true;
        }
      }

      const preUploadedImageIds = imageAttachments
        .filter(att => att.id && !imagesToUpload.some(itu => itu.tempId === att.tempId))
        .map(att => att.id!);

      uploadedImageIdsList = [...uploadedImageIdsList, ...preUploadedImageIds];

      if (uploadFailures) {
        toast.error("Message not sent due to upload failures. Please check attachments and retry.");
        setLocalProcessingStep(null);
        return;
      }

      // 5. File ID Mapping
      const attachedFileNames = attachedFiles.map(f => f.file.name);
      const matchingStoredFiles = (files || []).filter(f => attachedFileNames.includes(f.name)).map(f => f.id);

      // 6. Send Message
      try {
        setLocalProcessingStep(null); // Clear local processing before sending to AI
        await sendMessage(finalContent, matchingStoredFiles, uploadedImageIdsList);
        handleClearAttachments(); // Clear only on success

        // Reset search mode to 'auto' after sending, if it was manually overridden
        if (searchMode !== 'auto') {
          setSearchMode('auto');
        }

      } catch (sendError) {
        const errorMsg = sendError instanceof Error ? sendError.message : 'Failed to send message.';
        toast.error(`Error sending message: ${errorMsg}`);
      } finally {
        // Ensure local processing state is cleared even if errors occurred during send
        setLocalProcessingStep(null);
      }
    },
    // Dependency array carefully constructed
    [
      isSending, isLocalProcessing, attachedFiles, imageAttachments, isUploading, accessToken,
      agentiveSearchEnabled, searchMode, messages, files, sendMessage, handleClearAttachments,
      userId, sessionId, uploadSingleImage, context, contextEnabled, selectedModel
    ]
  );

  // *** NEW: Handler for the input area search toggle ***
  const handleSearchToggle = useCallback(() => {
    setSearchMode(prevMode => {
      // Cycle through Auto -> Manual -> Off
      let newMode: SearchMode;
      if (prevMode === 'auto') newMode = 'manual';
      else if (prevMode === 'manual') newMode = 'off';
      else newMode = 'auto';

      console.log('[Agentive Search] Search mode changed:', prevMode, '->', newMode);
      const modeLabels = { auto: 'Smart Search: Auto', manual: 'Smart Search: Manual', off: 'Smart Search: Off' };
      toast.success(modeLabels[newMode], { duration: 2000 });

      return newMode;
    });
  }, []);

  const handleExport = useCallback(
    async (format: 'markdown' | 'json') => {
      const startTime = Date.now();
      const toastId = toast.loading('Preparing export...');
      try {
        const metadata = { title: sessionName || 'Conversation', exportDate: new Date().toISOString(), messageCount: messages.length, format };
        const content = await exportWithWorker(messages, metadata, format, (progress) => {
          if (progress < 100) toast.loading(`Exporting: ${progress.toFixed(0)}%`, { id: toastId });
        });
        const filename = generateFilename(sessionName || 'conversation', format);
        const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json';
        downloadFile(content, filename, mimeType);
        const fileSize = getFileSizeEstimate(content);
        const duration = Date.now() - startTime;
        trackExport(format, messages.length, fileSize, duration, messages.length > 200);
        toast.success(`Successfully exported as ${filename}`, { id: toastId, duration: 3000 });
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export conversation.', { id: toastId });
      }
    },
    [messages, sessionName]
  );

  useEffect(() => {
    if (onRegisterFileCallback) onRegisterFileCallback(handleFileSelect);
  }, [onRegisterFileCallback, handleFileSelect]);

  useEffect(() => {
    if (onRegisterStorageCallback) onRegisterStorageCallback(handleStorageClick);
  }, [onRegisterStorageCallback, handleStorageClick]);


  // ==========================================================================
  // MARK: RENDER HELPERS
  // ==========================================================================

  // Elite Modern Empty State: Typographic focus, gradient text, minimalist chips.
  const renderEmptyState = () => {
    const containerVariants = {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { delay: 0.2, staggerChildren: 0.05 } }
    };
    const itemVariants = {
      hidden: { opacity: 0, y: 5 },
      show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
    };

    const greeting = userName ? `Hello, ${userName}` : "Hello";

    return (
      <div className="flex flex-col h-full justify-between items-center px-4 sm:px-6 antialiased">
        <div className="flex-1"></div>
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className='text-center'
          >
            <h1 className="text-5xl md:text-6xl font-semibold text-transparent bg-clip-text bg-gradient-to-br from-gray-400 via-blue-400 to-purple-500 mb-4">
              {greeting}
            </h1>
            <h2 className="text-4xl md:text-5xl font-semibold text-zinc-500">
              How can I help you today?
            </h2>
          </motion.div>
        </div>

        <div className="w-full max-w-4xl mb-8">
          <motion.div
            className="flex flex-wrap justify-center gap-3"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {SUGGESTED_PROMPTS.map((item, index) => (
              <motion.button
                key={index}
                variants={itemVariants}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] rounded-full text-sm font-medium text-zinc-300 hover:text-white transition-all duration-150 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => handleSendMessage(item.prompt)}
                disabled={isSending}
                aria-label={`Use prompt: ${item.title}`}
                title={item.prompt}
              >
                {item.title}
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>
    );
  };


  // ==========================================================================
  // MARK: RENDERING
  // ==========================================================================

  // *** NEW: Helper to map processing states to UI details ***
  const getProcessingDetails = () => {
    // Show retry indicator if retrying
    if (isRetrying && retryCount > 0) {
      return {
        step: `AI is busy, retrying... (attempt ${retryCount}/2)`,
        modelName: null,
        icon: <RefreshCw className="w-5 h-5 text-yellow-400 animate-spin" />,
        progress: 25
      };
    }
    // Prioritize local steps (Search, Upload) as they happen before the main AI processing
    if (localProcessingStep) {
      switch (localProcessingStep) {
        case 'detecting_intent':
          // Use a pulsing Zap icon for intent detection (fast operation)
          return { step: "Analyzing intent...", modelName: null, icon: <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />, progress: 0 };
        case 'searching_web':
          // Use a search icon for web search
          return { step: "Searching the web...", modelName: "Perplexity", icon: <SearchIcon className="w-5 h-5 text-blue-400 animate-pulse" />, progress: 50 };
        case 'uploading':
          return { step: "Uploading files...", modelName: null, icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />, progress: 50 };
      }
    }
    // Fallback to the main AI processing steps
    if (isProcessing) {
      return { step: currentStep, progress: currentProgress, modelName: activeModelConfig?.name || null, icon: undefined };
    }
    return null;
  };

  const processingDetails = getProcessingDetails();

  return (
    <div className="flex h-full relative overflow-hidden antialiased bg-zinc-950 text-zinc-200 font-sans selection:bg-blue-500/30">

      <AnimatePresence>
        {activeLightboxImage && (
          <ImageLightbox
            imageUrl={activeLightboxImage}
            onClose={() => setActiveLightboxImage(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative z-0" role="main">
        {/* --- Header (Floating Glass) --- */}
        <header className="absolute top-0 left-0 right-0 z-20 px-4 pt-4 pb-2 pointer-events-none">
          <div className="max-w-5xl mx-auto w-full pointer-events-auto">
            <div className="bg-zinc-900/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-glass-sm flex items-center justify-between h-14 px-4 transition-all duration-300 hover:bg-zinc-900/80">
              {/* Left: Title */}
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleTitleSave}
                    className="px-3 py-1.5 bg-zinc-800/50 text-zinc-100 text-sm font-medium rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/70 transition-shadow w-full max-w-md"
                    maxLength={100}
                    aria-label="Edit session title"
                  />
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-sm font-medium text-zinc-200 truncate" title={sessionName || 'New Session'}>{sessionName || 'New Session'}</h1>
                    {onUpdateSessionName && sessionId && (
                      <button
                        onClick={handleTitleEdit}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title="Edit title"
                        aria-label="Edit session title"
                        disabled={isSending || isUploading || isLocalProcessing}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Center: Space Selector (Desktop) */}
              <div className='hidden md:block absolute left-1/2 transform -translate-x-1/2 max-w-xs w-full'>
                <div className="flex justify-center">
                  <SpaceSelector
                    userId={userId}
                    selectedSpaceId={selectedSpaceId}
                    onSelectSpace={setSelectedSpaceId}
                    onCreateSpace={() => {
                      setEditingSpaceId(null);
                      setShowSpaceSettings(true);
                    }}
                  />
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                {/* Model Selector */}
                <div className="relative" ref={dropdownRef} onKeyDown={handleDropdownKeyDown}>
                  <button
                    ref={modelButtonRef}
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group"
                    disabled={isSending || isUploading}
                    aria-haspopup="listbox"
                    aria-expanded={showModelDropdown}
                  >
                    {selectedModel === 'auto' && activeModelConfig ? (
                      <span className='flex items-center gap-1.5' title={`Auto-routed to ${activeModelConfig.name}`}>
                        <Zap className="w-3 h-3 text-yellow-500/80 group-hover:text-yellow-500 transition-colors" />
                        <span className='text-zinc-400 group-hover:text-white hidden sm:inline'>{activeModelConfig.name}</span>
                      </span>
                    ) : (
                      <span className="hidden sm:inline">{currentModelConfig.name}</span>
                    )}
                    <span className="sm:hidden">{currentModelConfig.name.split(' ')[0]}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showModelDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showModelDropdown && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 4 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-64 p-2 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-xl z-50"
                        role="listbox"
                      >
                        {modelKeys.map((key, index) => {
                          const config = MODEL_CONFIGS[key];
                          const isSelected = selectedModel === key;
                          const isFocused = focusedModelIndex === index;
                          return (
                            <button
                              key={key}
                              role="option"
                              aria-selected={isSelected}
                              tabIndex={isFocused ? 0 : -1}
                              onClick={() => handleModelSelect(key)}
                              className={cn(
                                "w-full p-2 text-left rounded-lg transition-colors focus:outline-none mb-1 last:mb-0",
                                "hover:bg-white/[0.05]",
                                isSelected && "bg-blue-600/20 text-blue-200",
                                isFocused && (isSelected ? "ring-1 ring-inset ring-blue-400/50" : "bg-white/[0.08]")
                              )}
                              ref={el => { if (isFocused && el) setTimeout(() => el.focus(), 0); }}
                            >
                              <div className="flex items-center justify-between">
                                <span className={cn("text-sm font-medium", isSelected ? "text-blue-100" : "text-zinc-300")}>{config.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                              </div>
                              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{config.description}</p>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Snippets Toggle */}
                <button
                  onClick={handleToggleCodeSnippets}
                  className={cn(
                    "relative p-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    showCodeSnippets ? "text-blue-400 border-blue-500/30 bg-blue-500/10" : "text-zinc-400 hover:text-white"
                  )}
                  title="Code snippets"
                >
                  <Code2 className="w-4 h-4" />
                  {snippets.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">
                      {snippets.length}
                    </span>
                  )}
                </button>

                {/* Desktop Overflow Menu */}
                <div className="relative" ref={desktopMenuRef}>
                  <button
                    onClick={() => setShowDesktopMenu(!showDesktopMenu)}
                    className="p-2 text-zinc-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {showDesktopMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 4 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-48 p-1.5 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-xl z-50"
                      >
                        {contextEnabled && (
                          <button
                            onClick={() => { setShowDesktopMenu(false); setShowContextEditor(true); }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Global Context {context?.is_active && <span className="ml-auto w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                          </button>
                        )}
                        {exportEnabled && (
                          <button
                            onClick={() => { setShowDesktopMenu(false); handleExport('markdown'); }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                            disabled={isSending || messages.length === 0}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export Chat
                          </button>
                        )}
                        <div className="my-1 border-t border-white/5" />
                        <button
                          onClick={() => { setShowDesktopMenu(false); clearMessages(); }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                          disabled={isSending || isUploading || messages.length === 0 || isLoadingHistory}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Clear Chat
                        </button>
                        {onDeleteSession && sessionId && (
                          <button
                            onClick={handleDeleteSession}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Session
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Context Banner (Centered) */}
        {contextEnabled && context?.is_active && context.context_content && (
          <div className="absolute top-20 left-0 right-0 z-10 flex justify-center pointer-events-none">
            <div className="pointer-events-auto max-w-5xl w-full px-4">
              <ContextBanner
                content={context.context_content}
                characterCount={context.character_count || 0}
                tokenEstimate={context.token_estimate || 0}
                onEdit={() => setShowContextEditor(true)}
                onToggle={toggleActive}
                syncing={contextSyncing}
              />
            </div>
          </div>
        )}

        {/* --- Messages Area --- */}
        <div className="flex-1 overflow-hidden relative pt-20">
          <div
            className="h-full overflow-y-auto custom-scrollbar px-4"
            ref={messagesWrapperRef}
            aria-live="polite"
            role="log"
            tabIndex={messages.length > 0 ? 0 : -1}
          >
            <div className="max-w-5xl mx-auto w-full min-h-full flex flex-col">
              {isLoadingHistory ? (
                <LoadingFallback />
              ) : (
                <>
                  {/* Display Empty State only if no messages AND no search results yet */}
                  {messages.length === 0 && !searchResults ? (
                    renderEmptyState()
                  ) : (
                    <>
                      {/* Search Results Display (Displayed immediately when available) */}
                      {searchResults && (
                        <div className="pt-4 mb-6">
                          <SearchResults
                            results={searchResults.references}
                            metadata={searchResults.metadata}
                            className="max-w-4xl mx-auto"
                          />
                        </div>
                      )}

                      <MessageList
                        messages={messages}
                        isStreaming={isSending}
                        onImageClick={handleImageClick}
                      />

                      {/* *** ENHANCED: Unified Processing Indicator *** */}
                      <AnimatePresence>
                        {processingDetails && (
                          <ProcessingIndicator
                            {...processingDetails}
                          />
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>

          <AnimatePresence>
            {!isNearBottom && messages.length > 0 && !isLoadingHistory && (
              <ScrollToBottomButton onClick={scrollToBottom} />
            )}
          </AnimatePresence>
        </div>

        {/* --- Input Area --- */}
        <div className="ios-safe-bottom bg-zinc-950/0 pointer-events-none">
          <div className="max-w-5xl mx-auto w-full px-4 pb-4 pointer-events-auto">
            {/* File Preview Container */}
            {(attachedFiles.length > 0 || imageAttachments.length > 0) && (
              <div className="mb-2">
                <FileUploadPreview
                  localFiles={attachedFiles}
                  imageAttachments={imageAttachments}
                  onRemoveFileById={handleRemoveFile}
                  onRemoveImageById={handleRemoveImage}
                  onClear={handleClearAttachments}
                  onRetryUpload={handleRetryUpload}
                />
              </div>
            )}

            <ChatInputArea
              onSend={handleSendMessage}
              onFileSelect={handleFileSelect}
              onImageSelect={handleImageSelect}
              isStreaming={isSending || isLocalProcessing}
              disabled={isSending || isLoadingHistory || isUploading || isLocalProcessing}
              hasAttachedFiles={attachedFiles.length > 0}
              hasAttachedImages={imageAttachments.length > 0}
              onStorageClick={handleStorageClick}
              storageButtonRef={storageButtonRef}
              onScrollToBottom={undefined}
              onError={message => toast.error(message)}
              searchEnabled={searchMode !== 'off'}
              onSearchToggle={handleSearchToggle}
            />
          </div>
        </div>

        {/* Global Error Display */}
        {error && !isLoadingHistory && !isRetrying && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full px-4">
            <div className="p-3 bg-red-500/10 backdrop-blur-md border border-red-500/20 rounded-xl flex items-center gap-3 shadow-lg" role="alert">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm text-red-200 font-medium">{error.message}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- Code Snippets Sidebar --- */}
      <AnimatePresence>
        {showCodeSnippets && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="md:hidden fixed inset-0 bg-black/60 z-30"
            onClick={handleToggleCodeSnippets}
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          "h-full transition-transform duration-300 ease-in-out bg-zinc-950 border-l border-white/[0.08]",
          "md:relative md:translate-x-0",
          "fixed top-0 right-0 z-40 w-[85%] max-w-sm",
          { "translate-x-full md:w-0 md:border-l-0": !showCodeSnippets, "translate-x-0 md:w-80": showCodeSnippets }
        )}
        aria-hidden={!showCodeSnippets}
        // Improve visibility handling for transition end
        style={{ visibility: showCodeSnippets ? 'visible' : 'hidden' }}
      >
        {showCodeSnippets && (
          <Suspense fallback={<LoadingFallback />}>
            <CodeSnippetSidebar
              snippets={snippets as CodeSnippet[]}
              isLoading={isLoadingSnippets}
              isExtracting={isExtracting}
              onToggleBookmark={toggleBookmark}
              onCopySnippet={handleCopySnippet}
              onDownloadSnippet={handleDownloadSnippet}
              onNavigateToMessage={handleNavigateToMessage}
              onClose={handleToggleCodeSnippets}
            />
          </Suspense>
        )}
      </div>

      {/* Lazy Loaded Modals */}
      <Suspense fallback={null}>
        {showStorage && sessionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={handleStorageClick}>
            <div className="w-full max-w-5xl h-[90vh] md:h-[85vh] bg-zinc-900 border border-white/[0.1] rounded-3xl flex flex-col shadow-2xl overflow-hidden focus:outline-none" onClick={(e) => e.stopPropagation()}>
              <StorageManager
                sessionId={sessionId}
                onSchemaSelect={(schema) => { handleSchemaSelect(schema); handleStorageClick(); }}
                mode="hybrid"
                onClose={handleStorageClick}
              />
            </div>
          </div>
        )}

        {contextEnabled && showContextEditor && (
          <ContextEditorModal
            isOpen={showContextEditor}
            onClose={() => setShowContextEditor(false)}
            contextContent={context?.context_content || ''}
            isActive={context?.is_active || false}
            onSave={saveContext}
            currentModel={selectedModel}
          />
        )}

        {showSpaceSettings && (
          <SpaceSettingsModal
            spaceId={editingSpaceId}
            userId={userId}
            isOpen={showSpaceSettings}
            onClose={() => setShowSpaceSettings(false)}
            onSave={() => setShowSpaceSettings(false)}
          />
        )}

        {showSpacesIntro && (
          <SpacesIntroModal
            isOpen={showSpacesIntro}
            onClose={() => { setShowSpacesIntro(false); markSpacesIntroAsSeen(); }}
          />
        )}
      </Suspense>
    </div>
  );
};

export default ChatInterface;