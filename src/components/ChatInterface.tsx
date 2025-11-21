import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, KeyboardEvent as ReactKeyboardEvent, Suspense, lazy, FC, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown, Trash2, RefreshCw, AlertCircle, Check,
  X, Edit2, Code2, Zap, Loader2, ArrowDown,
  MoreVertical, Download, Settings, Search as SearchIcon, Globe, Sparkles, Cpu
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// MARK: Internal Hooks
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
import { trackEvent } from '../lib/analytics'; // Generalized analytics tracking
import { getSearchService, detectSearchIntent, SearchIntent } from '../services/searchService';

// MARK: Types
import { StoredFile, SavedSchema, ImageAttachment, CodeSnippet, LocalFileAttachment, ChatMessage, Context } from '../types';

// ============================================================================
// LAZY LOADED COMPONENTS (Vercel Quality: Optimized Loading)
// ============================================================================
// Ensure the import paths match the actual file structure (e.g., default exports)
const StorageManager = lazy(() => import('./StorageManager').then(module => ({ default: module.StorageManager })));
const CodeSnippetSidebar = lazy(() => import('./CodeSnippetSidebar').then(module => ({ default: module.CodeSnippetSidebar })));
const ContextEditorModal = lazy(() => import('./ContextEditorModal').then(module => ({ default: module.ContextEditorModal })));
const SpaceSettingsModal = lazy(() => import('./SpaceSettingsModal').then(module => ({ default: module.SpaceSettingsModal })));
const SpacesIntroModal = lazy(() => import('./SpacesIntroModal').then(module => ({ default: module.SpacesIntroModal })));

// ============================================================================
// CONFIGURATION & TYPES
// ============================================================================
interface SaveSchemaArgs {
  name: string;
  content: string | Record<string, unknown> | unknown[];
  format?: string;
  description?: string;
  source_file?: string;
}

// Type guard for robust runtime checking
function isSaveSchemaArgs(args: unknown): args is SaveSchemaArgs {
  if (typeof args !== 'object' || args === null) return false;
  const record = args as Record<string, unknown>;
  return typeof record.name === 'string' && record.name.length > 0 && record.content !== undefined;
}

const MAX_IMAGE_SIZE_MB = 10;
const MAX_FILE_SIZE_MB = 50;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SEARCH_MAX_QUERY_LENGTH = 800;

const SUGGESTED_PROMPTS = [
  { title: "I have an idea but can't code", prompt: "I have a business idea that needs software built. Can you help me understand how to start turning my concept into a real product?" },
  { title: "Help me build something real", prompt: "I want to build a production-ready application. Walk me through the process from initial concept to deployed product." },
  { title: "Walk me through deployment", prompt: "I have code that works locally but I need help deploying it to production. What's the best approach?" },
  { title: "Turn this into production code", prompt: "I have a prototype/concept that works but it needs to become production-grade software. Help me architect this properly." }
];

type SearchMode = 'auto' | 'manual' | 'off';
type LocalProcessingStep = 'detecting_intent' | 'searching_web' | 'uploading' | 'validating_context' | null;

// ============================================================================
// UTILITY HOOKS (Stripe Quality: Robust Utilities)
// ============================================================================

/**
 * Hook for detecting clicks outside a referenced element.
 * Optimized using useRef for the handler and event capturing.
 */
const useClickOutside = (ref: React.RefObject<HTMLElement> | React.RefObject<HTMLElement>[], handler: () => void) => {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const refs = Array.isArray(ref) ? ref : [ref];
      const clickedInside = refs.some(r => r.current && r.current.contains(event.target as Node));
      if (!clickedInside) {
        savedHandler.current();
      }
    };

    // Use capture phase (true) for reliability
    document.addEventListener('mousedown', listener, true);
    document.addEventListener('touchstart', listener, true);

    return () => {
      document.removeEventListener('mousedown', listener, true);
      document.removeEventListener('touchstart', listener, true);
    };
  }, [ref]);
};

// ============================================================================
// UTILITY COMPONENTS (Jony Ive Quality: Minimalist and Polished)
// ============================================================================
const LoadingFallback: FC = memo(() => (
  <div className="flex items-center justify-center h-full w-full" role="status" aria-label="Loading">
    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
  </div>
));

const ScrollToBottomButton: FC<{ onClick: () => void }> = memo(({ onClick }) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    transition={{ duration: 0.2, ease: 'easeOut' }}
    onClick={onClick}
    className="absolute bottom-6 right-6 z-20 p-3 bg-zinc-800/80 hover:bg-zinc-700/90 rounded-full shadow-xl transition-all duration-150 backdrop-blur-xl border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    aria-label="Scroll to bottom"
    title="Scroll to bottom"
    whileTap={{ scale: 0.90 }}
    whileHover={{ scale: 1.05 }}
  >
    <ArrowDown className="w-5 h-5 text-zinc-100" />
  </motion.button>
));

interface ProcessingIndicatorProps {
  step: string;
  progress: number;
  modelName: string | null;
  icon?: React.ReactNode;
}

const ProcessingIndicator: FC<ProcessingIndicatorProps> = memo(({ step, progress, modelName, icon }) => (
  <motion.div
    layout // Smooth layout transition
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 15 }}
    transition={{ duration: 0.2 }}
    className="flex items-center gap-4 px-5 py-3 bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-lg mx-auto my-4 max-w-md"
    role="status"
    aria-live="assertive"
  >
    <div className="text-blue-400">
      {icon ? icon : <Loader2 className="w-5 h-5 animate-spin" />}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-zinc-100 truncate">
        {step || 'Processing...'}
        {modelName && <span className='text-zinc-400 ml-2 font-normal text-xs'>({modelName})</span>}
      </p>
      {progress > 0 && (
        <div
          className="w-full bg-zinc-700 rounded-full h-1 mt-1.5 overflow-hidden"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <motion.div
            className="bg-blue-500 h-1"
            initial={{ width: '0%' }}
            // Ensure minimum visibility (5%) and smooth animation
            animate={{ width: `${Math.max(5, progress)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
    </div>
  </motion.div>
));

// Optimized ImageLightbox with focus management and focus trap
const ImageLightbox: FC<{ imageUrl: string; onClose: () => void }> = memo(({ imageUrl, onClose }) => {
  const lightboxRef = useRef<HTMLDivElement>(null);

  // Accessibility: Keyboard handling and focus trapping (Stripe Quality UX)
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    // Focus Trap Implementation
    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = lightboxRef.current;
    
    const focusableContent = modal?.querySelectorAll(focusableElements);
    const firstFocusableElement = focusableContent?.[0] as HTMLElement;
    const lastFocusableElement = focusableContent?.[focusableContent.length - 1] as HTMLElement;

    const trapFocus = (e: globalThis.KeyboardEvent) => {
        if (e.key !== 'Tab' || !modal) return;
        if (e.shiftKey) { // shift + tab
            if (document.activeElement === firstFocusableElement) {
                lastFocusableElement?.focus();
                e.preventDefault();
            }
        } else { // tab
            if (document.activeElement === lastFocusableElement) {
                firstFocusableElement?.focus();
                e.preventDefault();
            }
        }
    };

    document.addEventListener('keydown', trapFocus);
    
    // Initial focus set
    firstFocusableElement?.focus();

    return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keydown', trapFocus);
    };

  }, [onClose]);

  return (
    <motion.div
      ref={lightboxRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 ios-safe-area"
      onClick={onClose}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Image Viewer"
    >
      <motion.img
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        src={imageUrl}
        alt="Enlarged view"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
      />
      <button
        onClick={onClose}
        className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="Close image viewer"
      >
        <X className="w-6 h-6" />
      </button>
    </motion.div>
  );
});

// ============================================================================
// HELPER FUNCTIONS (Vercel Quality: Extracted Logic for Maintainability)
// ============================================================================

interface SearchResult {
    summary: string;
    references: any[];
    metadata: Record<string, any>;
}

/**
 * Handles the logic for determining if a search is needed and executing it.
 */
async function processSearchIntent(
    content: string,
    messages: ChatMessage[],
    searchMode: SearchMode,
    accessToken: string,
    sessionId: string | null,
    setLocalProcessingStep: (step: LocalProcessingStep) => void,
    hasAttachments: boolean
): Promise<SearchResult | null> {
    
    // Heuristics to avoid expensive search detection
    const hasCodeBlocks = /```[\s\S]*?```/.test(content);
    const isVeryLong = content.length > 1500;

    let shouldSearch = false;
    let triggerSource: 'auto' | 'manual' = 'manual';
    let intentComplexity: 'high' | 'low' = 'low';

    if (searchMode === 'manual') {
        if (hasAttachments) {
            // UX Improvement: Inform user why manual search is blocked
            toast.info("Manual search is disabled when files or images are attached.", { duration: 3000 });
            return null;
        }
        shouldSearch = true;
    } else if (searchMode === 'auto') {
        if (hasCodeBlocks || isVeryLong || hasAttachments) {
            console.log('[Agentive Search] Skipping auto-search: code blocks, long message, or attachments detected');
        } else {
            setLocalProcessingStep('detecting_intent');
            try {
                const intent: SearchIntent = await detectSearchIntent(content, messages);
                // Step reset is handled by the caller after the full chain

                if (intent.requiresSearch) {
                    shouldSearch = true;
                    triggerSource = 'auto';
                    intentComplexity = intent.complexity || 'low';
                    toast('Smart Search activated.', { icon: <Globe className='w-4 h-4 text-blue-500' />, duration: 1500 });
                }
            } catch (error) {
                console.error('[Agentive Search] Intent detection failed:', error);
                // Proceed without search if detection fails
            }
        }
    }

    if (!shouldSearch) return null;

    setLocalProcessingStep('searching_web');
    try {
        const searchService = getSearchService(accessToken);
        let searchQuery = content;

        if (searchQuery.length > SEARCH_MAX_QUERY_LENGTH) {
            searchQuery = searchQuery.substring(0, SEARCH_MAX_QUERY_LENGTH);
            toast.info(`Query truncated for search.`, { duration: 1500 });
        }

        // Use a higher quality model for complex or manually triggered searches
        const searchModel = (triggerSource === 'manual' || intentComplexity === 'high') ? 'sonar-pro' : 'sonar';

        const searchResponse = await searchService.search({
            query: searchQuery,
            session_id: sessionId,
            conversation_id: sessionId,
            max_results: 5,
            model: searchModel,
            trigger_source: triggerSource,
        });

        return {
            summary: searchResponse.search_summary,
            references: searchService.formatSearchResults(searchResponse.references),
            metadata: {
                query_id: searchResponse.metadata?.query_id || 'unknown',
                search_triggered: true,
                search_triggered_by: triggerSource,
                model_used: searchResponse.metadata?.model_used || searchModel,
                sources_count: searchResponse.references.length,
                // ... other metadata
            }
        };
    } catch (error) {
        // Graceful degradation
        console.error('Search error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Web search unavailable';
        if (errorMsg.includes('Quota exceeded')) {
            toast.error('Search quota exceeded. Proceeding without web context.', { duration: 3000 });
        } else {
            toast('Web search failed. Proceeding without web context.', { icon: '⚠️', duration: 2500 });
        }
        return null;
    }
}

/**
 * Validates and prepares the pinned context if active.
 */
async function processPinnedContext(
    context: Context | null,
    content: string,
    selectedModel: AiModelKey,
    setLocalProcessingStep: (step: LocalProcessingStep) => void
): Promise<string> {
    if (!context || !context.is_active || !context.context_content) {
        return "";
    }

    setLocalProcessingStep('validating_context');
    try {
        const validation = await validateTokenLimit(context.context_content, content, selectedModel);
        if (!validation.isValid) {
            toast.error(`Token limit exceeded (${validation.totalTokens}/${validation.maxTokens}). Pinned context ignored.`);
            return "";
        }
        return `<pinned_context>\n${context.context_content}\n</pinned_context>\n\n---\n\n`;
    } catch (error) {
        console.error('Error validating token limit:', error);
        toast.error('Could not validate token limits. Sending without global context.');
        return "";
    }
}


// ============================================================================
// COMPONENT DEFINITION
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

const ChatInterface: FC<ChatInterfaceProps> = ({
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
  // STATE & REFS
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
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showContextEditor, setShowContextEditor] = useState(false);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [showSpaceSettings, setShowSpaceSettings] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [showSpacesIntro, setShowSpacesIntro] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('auto');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [localProcessingStep, setLocalProcessingStep] = useState<LocalProcessingStep>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesWrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const storageButtonRef = useRef<HTMLButtonElement>(null);
  const isSavingTitle = useRef(false);
  const latestProviderRef = useRef('unknown');
  // Use ref to track attachments for callbacks/cleanup without causing re-renders
  const imageAttachmentsRef = useRef(imageAttachments);

  // ==========================================================================
  // HOOKS
  // ==========================================================================
  const contextEnabled = useFeatureFlag('pinned_context');
  const exportEnabled = useFeatureFlag('export_conversation');
  const agentiveSearchEnabled = useFeatureFlag('agentive_web_search');

  const {
    context,
    syncing: contextSyncing,
    saveContext,
    toggleActive,
  } = useContextManager(userId || undefined);

  const { hasSeenSpacesIntro, isLoading: isLoadingOnboarding, markSpacesIntroAsSeen } = useOnboardingState(userId || undefined);

  // Global click outside handler for closing menus
  useClickOutside([dropdownRef, desktopMenuRef], () => {
    if (showModelDropdown) {
      setShowModelDropdown(false);
      setFocusedModelIndex(-1);
    }
    setShowDesktopMenu(false);
  });

  // ==========================================================================
  // CORE CHAT & SNIPPET LOGIC
  // ==========================================================================
  const handleActionRequest = useCallback(
    async (action: string, args: unknown, messageId: string, appendMessage: Function) => {
      // Centralized action handling logic (e.g., AI tool usage)
      if (action === 'save_schema' && sessionId) {
        if (!isSaveSchemaArgs(args)) {
          // Robust validation and system feedback
          const errorMsg = 'Schema save failed: Invalid arguments provided by AI.';
          toast.error(errorMsg);
          appendMessage({
            id: generateTempId(),
            role: 'system',
            content: `Action \`${action}\` failed: ${errorMsg} Ensure 'name' and 'content' are provided.`,
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
              contentString = JSON.stringify(parsedContent, null, 2); // Pretty print
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
          trackEvent('schema_saved', { format: format || 'unknown', model: latestProviderRef.current });
        } catch (e) {
          console.error('Error during save_schema action:', e);
          const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred';
          toast.error(`Failed to process schema save action: ${errorMsg}`);
          appendMessage({
            id: generateTempId(),
            role: 'system',
            content: `Action \`${action}\` failed: Internal error. Error: ${errorMsg}`,
            metadata: { action_status: 'error', related_message_id: messageId },
            createdAt: new Date().toISOString(),
          });
        }
      }
    },
    [sessionId, onSaveSchema]
  );

  // Ensure useAiRouterChat is correctly typed in the codebase. Removed 'as any'.
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
  });

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
  // MEMOIZED VALUES & EFFECTS
  // ==========================================================================
  const currentModelConfig = useMemo(() => MODEL_CONFIGS[selectedModel], [selectedModel]);
  const activeModelConfig = useMemo(() => activeModel ? MODEL_CONFIGS[activeModel] : null, [activeModel]);
  const modelKeys = useMemo(() => Object.keys(MODEL_CONFIGS) as AiModelKey[], []);

  // Performance: Memoize status indicators
  const isUploading = useMemo(() => imageAttachments.some(img => img.isUploading), [imageAttachments]);
  const isLocalProcessing = useMemo(() => localProcessingStep !== null, [localProcessingStep]);
  const isProcessing = useMemo(() => {
    if (!isSending) return false;
    // Check if the last message was from the user, indicating the AI is responding
    const lastMessage = messages[messages.length - 1];
    return lastMessage && lastMessage.role === 'user';
  }, [isSending, messages]);

  // Keep ref updated with current attachments for cleanup/callbacks
  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  // Cleanup Blob URLs on component unmount (Critical for memory management)
  useEffect(() => {
    return () => {
      imageAttachmentsRef.current.forEach(att => {
        if (att.url && att.url.startsWith('blob:') && att.file) {
          URL.revokeObjectURL(att.url);
        }
      });
    };
  }, []);

  // Effect: Determine the active model based on the last AI response
  useEffect(() => {
    // Optimized loop: Iterate backwards without creating new arrays (slice/reverse).
    let lastAiMessage: ChatMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
            lastAiMessage = messages[i] as ChatMessage;
            break;
        }
    }
    
    if (lastAiMessage?.metadata?.provider) {
      const provider = lastAiMessage.metadata.provider;
      latestProviderRef.current = provider;
      const matchedKey = modelKeys.find(key => MODEL_CONFIGS[key].providerKey === provider);
      setActiveModel(matchedKey || null);
    } else if (messages.length === 0) {
      // Reset on empty chat
      setActiveModel(null);
      latestProviderRef.current = 'unknown';
    }
  }, [messages, modelKeys]);

  // Effect: Focus management for title editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Effect: Initialize focused index for keyboard navigation in dropdowns
  useEffect(() => {
    if (showModelDropdown) {
      const currentIndex = modelKeys.indexOf(selectedModel);
      setFocusedModelIndex(currentIndex);
    } else {
      setFocusedModelIndex(-1);
    }
  }, [showModelDropdown, selectedModel, modelKeys]);

  // Effect: Handle Spaces introduction onboarding flow
  useEffect(() => {
    if (!isLoadingOnboarding && !hasSeenSpacesIntro && userId) {
      // Preload the modal code
      import('./SpacesIntroModal');
      // Show modal after a short delay for better UX
      const timer = setTimeout(() => setShowSpacesIntro(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoadingOnboarding, hasSeenSpacesIntro, userId]);

  // Effect: Propagate progress updates to parent component
  useEffect(() => {
    if (onProgressUpdate && isSending) {
      const modelName = activeModelConfig?.providerKey || latestProviderRef.current || 'system';
      // Map generic providers
      const mappedModel = ['claude', 'gemini', 'gpt'].some(prefix => modelName.startsWith(prefix)) ? modelName : 'system';
      onProgressUpdate(currentProgress, currentStep, mappedModel);
    }
  }, [currentProgress, currentStep, isSending, onProgressUpdate, activeModelConfig]);

  // ==========================================================================
  // SCROLL MANAGEMENT (Optimized for performance)
  // ==========================================================================

  // Check if the user is near the bottom of the chat
  const checkScrollPosition = useCallback(() => {
    const wrapper = messagesWrapperRef.current;
    if (!wrapper) return;
    // Threshold for "near bottom" detection
    const nearBottom = wrapper.scrollHeight - wrapper.scrollTop <= wrapper.clientHeight + 200;
    if (nearBottom !== isNearBottom) setIsNearBottom(nearBottom);
  }, [isNearBottom]);

  // Attach passive scroll listener
  useEffect(() => {
    const wrapper = messagesWrapperRef.current;
    if (wrapper) {
      if (!isLoadingHistory) checkScrollPosition();
      wrapper.addEventListener('scroll', checkScrollPosition, { passive: true });
      return () => wrapper.removeEventListener('scroll', checkScrollPosition);
    }
  }, [checkScrollPosition, isLoadingHistory]);

  // Auto-scroll to bottom when new messages arrive or history loads
  useLayoutEffect(() => {
    // Use 'auto' behavior for instant scrolling without jarring animation
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
    // Use 'smooth' behavior for user-initiated scrolling
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // ==========================================================================
  // HANDLERS (Session Management, UI Interactions)
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
        toast.success('Title updated', { id: loadingId });
        setIsEditingTitle(false);
        trackEvent('session_renamed');
      } catch (error) {
        toast.error('Failed to update title', { id: loadingId });
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
    }
    // Escape key handled by global useEffect below
  }, [handleTitleSave]);

  const handleImageClick = useCallback((imageUrl: string) => {
    setActiveLightboxImage(imageUrl);
  }, []);

  const handleModelSelect = useCallback((key: AiModelKey) => {
    setSelectedModel(key);
    setShowModelDropdown(false);
    setFocusedModelIndex(-1);
    modelButtonRef.current?.focus(); // Return focus to the trigger button
    trackEvent('model_selected', { model: key });
  }, []);

  // Robust keyboard navigation for model dropdown (A11y)
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

  
  const handleStorageClick = useCallback(() => {
    // Preload StorageManager component if opening
    if (!showStorage) import('./StorageManager');
    setShowStorage(prev => {
      const newState = !prev;
      // Ensure focus returns to the button when closed (A11y)
      if (!newState && storageButtonRef.current) {
        setTimeout(() => storageButtonRef.current?.focus(), 50);
      }
      return newState;
    });
  }, [showStorage]);

  // UX Improvement: Copy schema to clipboard on select
  const handleSchemaSelect = useCallback(async (schema: SavedSchema) => {
    try {
        const content = typeof schema.content === 'string' ? schema.content : JSON.stringify(schema.content, null, 2);
        await navigator.clipboard.writeText(content);
        toast.success(`Schema "${schema.name}" copied to clipboard. Paste it in the chat.`);
        handleStorageClick(); // Close storage after selection
    } catch (error) {
        console.error("Failed to copy schema:", error);
        toast.error(`Failed to copy schema "${schema.name}".`);
    }
  }, [handleStorageClick]);


  const handleToggleCodeSnippets = useCallback(() => {
    // Preload CodeSnippetSidebar component if opening
    if (!showCodeSnippets) import('./CodeSnippetSidebar');
    setShowCodeSnippets(prev => !prev);
  }, [showCodeSnippets]);

  // Stripe-level UX: Centralized keyboard shortcuts (Fallback implementation)
   useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Handle escape key presses in reverse Z-order priority
        if (activeLightboxImage) return; // Handled by ImageLightbox itself
        if (showStorage) {
            event.preventDefault();
            handleStorageClick();
        }
        else if (showCodeSnippets) {
            event.preventDefault();
            handleToggleCodeSnippets();
        }
        else if (showContextEditor) {
            event.preventDefault();
            setShowContextEditor(false);
        }
        else if (isEditingTitle) {
            event.preventDefault();
            handleTitleCancel();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // Dependencies required for the fallback implementation
  }, [activeLightboxImage, showStorage, showCodeSnippets, showContextEditor, isEditingTitle, handleStorageClick, handleToggleCodeSnippets, handleTitleCancel]);


  const handleCopySnippet = useCallback(async (snippet: CodeSnippet) => {
    try {
      await navigator.clipboard.writeText(snippet.content);
      toast.success('Code copied');
      trackEvent('snippet_copied', { language: snippet.language });
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
    trackEvent('snippet_downloaded', { language: snippet.language });
  }, []);

  const handleNavigateToMessage = useCallback((messageId: string) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Visual highlight feedback (CSS class 'highlight-flash' required)
      messageElement.classList.add('highlight-flash');
      setTimeout(() => messageElement.classList.remove('highlight-flash'), 2000);
      // Close sidebar on mobile for better viewing experience
      if (window.innerWidth < 768) setShowCodeSnippets(false);
    } else {
      toast.error('Message not found');
    }
  }, []);

  const handleDeleteSession = useCallback(() => {
    if (sessionId && onDeleteSession) {
      // Use a modern confirmation dialog if available, fallback to window.confirm
      if (window.confirm("Are you sure you want to delete this entire session? This action cannot be undone.")) {
        onDeleteSession(sessionId);
        trackEvent('session_deleted');
      }
    }
    setShowDesktopMenu(false);
  }, [sessionId, onDeleteSession]);

  // ==========================================================================
  // FILE & IMAGE HANDLING LOGIC
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
      prev.forEach(att => {
        if (att.url && att.url.startsWith('blob:') && att.file) URL.revokeObjectURL(att.url);
      });
      return [];
    });
  }, [isUploading]);

  // Robust image upload utility with progress tracking and error handling
  const uploadSingleImage = useCallback(async (attachment: ImageAttachment): Promise<string | null> => {
    if (!userId || !sessionId || !attachment.file) return null;
    if (attachment.id) return attachment.id;

    const updateAttachment = (tempId: string, updates: Partial<ImageAttachment>) => {
      setImageAttachments(prev => prev.map(att => att.tempId === tempId ? { ...att, ...updates } : att));
    };

    updateAttachment(attachment.tempId, { uploadProgress: 5, isUploading: true, uploadError: undefined });

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
    // Use the ref to access the current state reliably
    const attachmentToRetry = imageAttachmentsRef.current.find(att => att.tempId === tempId);
    if (attachmentToRetry && attachmentToRetry.uploadError && !attachmentToRetry.isUploading && attachmentToRetry.file) {
      await uploadSingleImage(attachmentToRetry);
    }
  }, [uploadSingleImage]);

    // ==========================================================================
    // MESSAGE SENDING LOGIC (Refactored Orchestration)
    // ==========================================================================

    const handleSendMessage = useCallback(
        async (content: string) => {
            // 1. Pre-send checks
            if (isSending || isLocalProcessing || (!content.trim() && attachedFiles.length === 0 && imageAttachments.length === 0)) return;
            if (isUploading) {
                toast.error("Please wait for current uploads to finish.");
                return;
            }
            if (!accessToken) {
                toast.error("Authentication required.");
                return;
            }

            let finalContent = content;
            let searchData: SearchResult | null = null;
            const hasAttachments = attachedFiles.length > 0 || imageAttachments.length > 0;

            // Helper to manage local processing state transitions safely
            const updateLocalStep = (step: LocalProcessingStep) => setLocalProcessingStep(step);

            try {
                // 2. Agentive Search Processing
                if (content.trim() && agentiveSearchEnabled && searchMode !== 'off') {
                    searchData = await processSearchIntent(
                        content,
                        messages,
                        searchMode,
                        accessToken,
                        sessionId,
                        updateLocalStep,
                        hasAttachments
                    );

                    if (searchData && searchData.summary) {
                        // Inject search context into the prompt
                        const context = `\n\n<web_search_context>\n[Current Web Search Results - ${new Date().toLocaleDateString()}]\n\n${searchData.summary}\n\nSources: ${searchData.references.map((r: any) => r.url).join(', ')}\n</web_search_context>\n\n[INSTRUCTION: Use the above context to answer the user's request. Integrate the findings naturally and cite sources.]`;
                        finalContent += context;
                        setSearchResults(searchData); // Display search results in UI
                    }
                }

                // 3. Pinned Context Injection
                if (contextEnabled) {
                    const pinnedContext = await processPinnedContext(context, finalContent, selectedModel, updateLocalStep);
                    finalContent = pinnedContext + finalContent;
                }

                // 4. File Upload Processing
                updateLocalStep('uploading');
                let uploadedImageIdsList: string[] = [];
                const imagesToUpload = imageAttachments.filter(att => !att.id && att.file);

                if (imagesToUpload.length > 0 && userId && sessionId) {
                    // Parallel uploads
                    const uploadPromises = imagesToUpload.map(attachment => uploadSingleImage(attachment));
                    const results = await Promise.all(uploadPromises);
                    uploadedImageIdsList = results.filter((id): id is string => id !== null);

                    if (uploadedImageIdsList.length < imagesToUpload.length) {
                        throw new Error("Message not sent due to image upload failures. Please check attachments.");
                    }
                }

                // Include already uploaded images
                const preUploadedImageIds = imageAttachments
                    .filter(att => att.id && !imagesToUpload.some(itu => itu.tempId === att.tempId))
                    .map(att => att.id!);
                uploadedImageIdsList = [...uploadedImageIdsList, ...preUploadedImageIds];


                // 5. Identify Attached File IDs (for files already stored)
                const attachedFileNames = attachedFiles.map(f => f.file.name);
                const matchingStoredFiles = (files || []).filter(f => attachedFileNames.includes(f.name)).map(f => f.id);

                // 6. Send Message
                updateLocalStep(null); // Clear local processing before sending to backend
                await sendMessage(finalContent, matchingStoredFiles, uploadedImageIdsList);

                // 7. Post-send cleanup
                handleClearAttachments();
                if (searchMode === 'manual') {
                    setSearchMode('auto'); // Reset search mode after manual use
                }
                trackEvent('message_sent', { length: content.length, attachments: attachedFiles.length + imageAttachments.length, search_triggered: !!searchData });

            } catch (sendError) {
                const errorMsg = sendError instanceof Error ? sendError.message : 'Failed to send message.';
                toast.error(`Error: ${errorMsg}`);
            } finally {
                updateLocalStep(null); // Ensure local processing state is cleared
            }
        },
        [
            isSending, isLocalProcessing, attachedFiles, imageAttachments, isUploading, accessToken,
            agentiveSearchEnabled, searchMode, messages, files, sendMessage, handleClearAttachments,
            userId, sessionId, uploadSingleImage, context, contextEnabled, selectedModel
        ]
    );

  const handleSearchToggle = useCallback(() => {
    setSearchMode(prevMode => {
      let newMode: SearchMode;
      if (prevMode === 'auto') newMode = 'manual';
      else if (prevMode === 'manual') newMode = 'off';
      else newMode = 'auto';

      const modeLabels = { auto: 'Smart Search: Auto', manual: 'Smart Search: Manual (Forced)', off: 'Smart Search: Off' };
      toast.success(modeLabels[newMode], { duration: 1500 });
      trackEvent('search_mode_toggled', { mode: newMode });
      return newMode;
    });
  }, []);

  const handleExport = useCallback(
    async (format: 'markdown' | 'json') => {
      const startTime = Date.now();
      const toastId = toast.loading('Preparing export...');
      try {
        const metadata = { title: sessionName || 'Conversation', exportDate: new Date().toISOString(), messageCount: messages.length, format };
        // Use Web Worker for efficient export processing
        const content = await exportWithWorker(messages, metadata, format, (progress: number) => {
          if (progress < 100) toast.loading(`Exporting: ${progress.toFixed(0)}%`, { id: toastId });
        });
        const filename = generateFilename(sessionName || 'conversation', format);
        const mimeType = format === 'markdown' ? 'text/markdown' : 'application/json';
        downloadFile(content, filename, mimeType);

        const fileSize = getFileSizeEstimate(content);
        const duration = Date.now() - startTime;
        trackEvent('conversation_exported', { format, count: messages.length, fileSize, duration });
        toast.success(`Export successful`, { id: toastId, duration: 3000 });
      } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export conversation.', { id: toastId });
      }
    },
    [messages, sessionName]
  );

  // Register callbacks for external triggers (e.g., sidebar file drop)
  useEffect(() => {
    if (onRegisterFileCallback) onRegisterFileCallback(handleFileSelect);
  }, [onRegisterFileCallback, handleFileSelect]);

  useEffect(() => {
    if (onRegisterStorageCallback) onRegisterStorageCallback(handleStorageClick);
  }, [onRegisterStorageCallback, handleStorageClick]);

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  // Jony Ive Quality Empty State: Refined aesthetic while retaining personality
  const renderEmptyState = () => {
    const containerVariants = {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { delay: 0.2, staggerChildren: 0.05 } }
    };
    const itemVariants = {
      hidden: { opacity: 0, y: 5 },
      show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
    };
    
    return (
      <div className="flex flex-col h-full justify-between items-center px-4 sm:px-6 antialiased">
        <div className="flex-1"></div>
        
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className='text-center max-w-3xl mx-auto'
          >
            {/* Refined Typography */}
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400">
              Hello
            </h1>

            <blockquote className="text-xl md:text-2xl font-medium text-zinc-400 tracking-tight leading-relaxed italic mb-3">
              "I started this gangsta shit, this the motherfkn thx i get"
            </blockquote>

            <p className="text-sm md:text-base text-zinc-600 font-medium tracking-wide mb-16">
              — Ice Cube, "Hello"
            </p>

            {/* Added icons for visual appeal */}
            <div className="space-y-4 text-sm text-zinc-500">
              <p className="flex items-center justify-center gap-3">
                <Sparkles className="w-4 h-4 text-blue-500" />
                Multi-provider routing. GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro.
              </p>
              <p className="flex items-center justify-center gap-3">
                <Zap className="w-4 h-4 text-yellow-500" />
                Built by someone who couldn't code 6 months ago.
              </p>
              <p className="flex items-center justify-center gap-3">
                <Cpu className="w-4 h-4 text-green-500" />
                Build it. Launch it. Own it.
              </p>
            </div>
          </motion.div>
        </div>

        <div className="w-full max-w-4xl mb-12">
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
                whileTap={{ scale: 0.98 }}
                // Refined button styling
                className="px-5 py-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-full text-sm font-medium text-zinc-400 hover:text-white transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
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

  // Determine the current processing status for the indicator
  const getProcessingDetails = () => {
    if (isRetrying && retryCount > 0) {
      return {
        step: `Connection issue, retrying... (attempt ${retryCount}/2)`,
        modelName: null,
        icon: <RefreshCw className="w-5 h-5 text-yellow-400 animate-spin" />,
        progress: 25
      };
    }
    if (localProcessingStep) {
      switch (localProcessingStep) {
        case 'detecting_intent':
          return { step: "Analyzing intent...", modelName: null, icon: <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />, progress: 10 };
        case 'searching_web':
          return { step: "Searching the web...", modelName: "Perplexity", icon: <SearchIcon className="w-5 h-5 text-blue-400 animate-pulse" />, progress: 30 };
        case 'validating_context':
            return { step: "Validating context...", modelName: null, icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />, progress: 5 };
        case 'uploading':
          return { step: "Uploading files...", modelName: null, icon: <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />, progress: 50 };
      }
    }
    if (isProcessing) {
      // Backend processing status
      return { step: currentStep, progress: currentProgress, modelName: activeModelConfig?.name || null, icon: undefined };
    }
    return null;
  };

  const processingDetails = getProcessingDetails();

  // ==========================================================================
  // RENDERING (Jony Ive Quality: Minimalist, precise, high fidelity)
  // ==========================================================================
  return (
    <div className="flex h-full relative overflow-hidden antialiased bg-zinc-950 text-zinc-200 font-sans selection:bg-blue-500/50">
      <AnimatePresence>
        {activeLightboxImage && (
          <ImageLightbox
            imageUrl={activeLightboxImage}
            onClose={() => setActiveLightboxImage(null)}
          />
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-0" role="main">

        {/* Floating Header */}
        <header className="absolute top-0 left-0 right-0 z-30 px-4 pt-4 pb-2 pointer-events-none">
          <div className="max-w-5xl mx-auto w-full pointer-events-auto">
            {/* Glassmorphic Panel for sleek UI (Requires global CSS definitions for .glass-panel) */}
            <div className="glass-panel glass-panel-hover rounded-2xl flex items-center justify-between h-14 px-4 shadow-lg">

              {/* Session Title & Edit */}
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleTitleSave}
                    className="px-3 py-1.5 bg-zinc-800/70 text-zinc-100 text-sm font-medium rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow w-full max-w-md"
                    maxLength={100}
                    aria-label="Edit session title"
                  />
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-sm font-medium text-zinc-100 truncate" title={sessionName || 'New Session'}>{sessionName || 'New Session'}</h1>
                    {onUpdateSessionName && sessionId && (
                      <button
                        onClick={handleTitleEdit}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title="Edit title"
                        aria-label="Edit session title"
                        disabled={isSending || isUploading || isLocalProcessing}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-400 hover:text-white" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Centered Space Selector (Desktop) */}
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

              {/* Right Controls (Model Selector, Snippets, Menu) */}
              <div className="flex items-center gap-2 flex-1 justify-end">

                {/* Model Selector Dropdown */}
                <div className="relative" ref={dropdownRef} onKeyDown={handleDropdownKeyDown}>
                  <button
                    ref={modelButtonRef}
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group"
                    disabled={isSending || isUploading}
                    aria-haspopup="listbox"
                    aria-expanded={showModelDropdown}
                  >
                    {/* Dynamic display for Auto-routing */}
                    {selectedModel === 'auto' && activeModelConfig ? (
                      <span className='flex items-center gap-1.5' title={`Auto-routed to ${activeModelConfig.name}`}>
                        <Zap className="w-3 h-3 text-yellow-500 group-hover:text-yellow-400 transition-colors" />
                        <span className='text-zinc-300 group-hover:text-white hidden sm:inline'>{activeModelConfig.name}</span>
                      </span>
                    ) : (
                      <span className="hidden sm:inline">{currentModelConfig.name}</span>
                    )}
                    {/* Mobile fallback */}
                    <span className="sm:hidden">{currentModelConfig.name.split(' ')[0]}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showModelDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu (Framer Motion) */}
                  <AnimatePresence>
                    {showModelDropdown && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-64 p-2 bg-zinc-900/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50"
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
                                "w-full p-3 text-left rounded-lg transition-colors focus:outline-none mb-1 last:mb-0",
                                "hover:bg-white/[0.08]",
                                isSelected && "bg-blue-600/20 text-blue-100",
                                isFocused && (isSelected ? "ring-1 ring-inset ring-blue-400/70" : "bg-white/[0.1]")
                              )}
                              // Ensure focus is set correctly for screen readers
                              ref={el => { if (isFocused && el) el.focus(); }}
                            >
                              <div className="flex items-center justify-between">
                                <span className={cn("text-sm font-medium", isSelected ? "text-white" : "text-zinc-300")}>{config.name}</span>
                                {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                              </div>
                              <p className="text-xs text-zinc-500 mt-1 truncate">{config.description}</p>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Code Snippets Toggle */}
                <button
                  onClick={handleToggleCodeSnippets}
                  className={cn(
                    "relative p-2 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    showCodeSnippets ? "text-blue-400 border-blue-500/40 bg-blue-500/15" : "text-zinc-400 hover:text-white"
                  )}
                  title="Toggle Code Snippets (Esc)"
                  aria-label="Toggle Code Snippets"
                >
                  <Code2 className="w-4 h-4" />
                  {snippets.length > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 flex items-center justify-center shadow-sm border border-zinc-900">
                      {snippets.length}
                    </motion.span>
                  )}
                </button>

                {/* More Options Menu */}
                <div className="relative" ref={desktopMenuRef}>
                  <button
                    onClick={() => setShowDesktopMenu(!showDesktopMenu)}
                    className="p-2 text-zinc-400 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label="More options"
                    aria-haspopup="menu"
                    aria-expanded={showDesktopMenu}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {showDesktopMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-zinc-900/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50"
                        role="menu"
                      >
                        {/* Menu Items (Requires 'menu-item' CSS class definition) */}
                        {contextEnabled && (
                          <button
                            onClick={() => { setShowDesktopMenu(false); setShowContextEditor(true); }}
                            className="menu-item"
                            role="menuitem"
                          >
                            <Settings className="w-4 h-4" />
                            Global Context
                            {context?.is_active && <span className="ml-auto w-2 h-2 bg-blue-500 rounded-full" title="Active" />}
                          </button>
                        )}
                        {exportEnabled && (
                          <button
                            onClick={() => { setShowDesktopMenu(false); handleExport('markdown'); }}
                            className="menu-item"
                            disabled={isSending || messages.length === 0}
                            role="menuitem"
                          >
                            <Download className="w-4 h-4" />
                            Export Chat (Markdown)
                          </button>
                        )}
                        <div className="my-1 border-t border-white/5" />
                        <button
                          onClick={() => { setShowDesktopMenu(false); clearMessages(); }}
                          className="menu-item"
                          disabled={isSending || isUploading || messages.length === 0 || isLoadingHistory}
                          role="menuitem"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Clear Chat History
                        </button>
                        {onDeleteSession && sessionId && (
                          <button
                            onClick={handleDeleteSession}
                            className="menu-item text-red-400 hover:bg-red-500/10 hover:text-red-400"
                            role="menuitem"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Context Banner (if active) */}
        {contextEnabled && context?.is_active && context.context_content && (
          <div className="absolute top-20 left-0 right-0 z-20 flex justify-center pointer-events-none mt-2">
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

        {/* Message Area */}
        <div className="flex-1 overflow-hidden relative pt-24">
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
                  {messages.length === 0 && !searchResults ? (
                    renderEmptyState()
                  ) : (
                    <>
                      {/* Display Search Results if available */}
                      {searchResults && (
                        <div className="pt-4 mb-6">
                          <SearchResults
                            results={searchResults.references}
                            metadata={searchResults.metadata}
                            className="max-w-4xl mx-auto"
                          />
                        </div>
                      )}

                      {/* Message List */}
                      <MessageList
                        messages={messages}
                        isStreaming={isSending}
                        onImageClick={handleImageClick}
                      />

                      {/* Processing Indicator */}
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
              {/* Scroll target */}
              <div ref={messagesEndRef} className="h-4 flex-shrink-0" />
            </div>
          </div>

          {/* Scroll to Bottom Button */}
          <AnimatePresence>
            {!isNearBottom && messages.length > 0 && !isLoadingHistory && (
              <ScrollToBottomButton onClick={scrollToBottom} />
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="ios-safe-bottom bg-zinc-950/0 pointer-events-none">
          <div className="max-w-5xl mx-auto w-full px-4 pb-4 pointer-events-auto">
            {/* File Upload Previews */}
            {(attachedFiles.length > 0 || imageAttachments.length > 0) && (
              <div className="mb-3">
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

            {/* Chat Input */}
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
              onScrollToBottom={scrollToBottom} // Pass scroll function for input focus handling
              onError={(message: string) => toast.error(message)}
              // Ensure ChatInputArea signature matches these props
              searchEnabled={agentiveSearchEnabled} 
              searchMode={searchMode}
              onSearchToggle={handleSearchToggle}
            />
          </div>
        </div>

        {/* Global Error Display */}
        {error && !isLoadingHistory && !isRetrying && (
          <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full px-4">
            <div className="p-4 bg-red-900/80 backdrop-blur-md border border-red-500/50 rounded-xl flex items-center gap-3 shadow-xl" role="alert">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm text-red-100 font-medium">{error.message}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Code Snippet Sidebar (Right Panel) */}
      {/* Mobile Overlay */}
      <AnimatePresence>
        {showCodeSnippets && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={handleToggleCodeSnippets}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <div
        className={cn(
           // Use transition-all for smooth width (desktop) and transform (mobile) animations
          "h-full transition-all duration-300 ease-in-out bg-zinc-950",
          "md:relative md:translate-x-0",
          "fixed top-0 right-0 z-50",
          // Base width for mobile
          "w-[85%] max-w-sm",
          // Conditional styles for open/closed state
          showCodeSnippets
            ? "translate-x-0 md:w-80 border-l border-white/[0.08] shadow-2xl md:shadow-none"
            : "translate-x-full md:w-0 md:border-l-0"
        )}
        aria-hidden={!showCodeSnippets}
        style={{ 
            // Performance Optimization: Use content-visibility and visibility
            contentVisibility: showCodeSnippets ? 'auto' : 'hidden',
            visibility: showCodeSnippets ? 'visible' : 'hidden',
            willChange: 'transform, width'
        }}
      >
        {/* Lazy load sidebar content */}
        {showCodeSnippets && (
          <Suspense fallback={<LoadingFallback />}>
            <CodeSnippetSidebar
              // Ensure snippets are correctly typed
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

      {/* Modals (Lazy Loaded) */}
      <Suspense fallback={null}>
        {showStorage && sessionId && (
           // Modal Container with improved styling
           <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" 
                onClick={handleStorageClick}
            >
            <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-5xl h-[90vh] md:h-[85vh] bg-zinc-900 border border-white/10 rounded-3xl flex flex-col shadow-2xl overflow-hidden focus:outline-none" 
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Storage Manager"
            >
              <StorageManager
                sessionId={sessionId}
                onSchemaSelect={handleSchemaSelect}
                mode="hybrid"
                onClose={handleStorageClick}
              />
            </motion.div>
          </motion.div>
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

/*
// CSS Required for features like glass-panel, menu-item, highlight-flash, and ios-safe-area
// Ensure these are defined in your global CSS file.

.menu-item {
  @apply w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none;
}
.glass-panel {
    background: rgba(24, 24, 27, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
    transition: background 0.3s, border 0.3s;
}
.glass-panel-hover:hover {
    background: rgba(24, 24, 27, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
}
.highlight-flash {
  animation: flash-highlight 1.5s ease-out;
}
@keyframes flash-highlight {
  0% { background-color: rgba(59, 130, 246, 0.2); }
  100% { background-color: transparent; }
}
.ios-safe-area {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
*/

export default memo(ChatInterface);
// Memoize the entire interface for performance.