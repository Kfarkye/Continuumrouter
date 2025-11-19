import React, {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  DragEvent,
  ChangeEvent,
  ClipboardEvent
} from 'react';
import {
  Send,
  ArrowDown,
  AlertCircle,
  Paperclip,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useInputInjection } from '../contexts/InputInjectionContext';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// Dynamic max height based on viewport, but falling back to pixels
const MIN_TEXTAREA_HEIGHT = 52;

const ALLOWED_TEXT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
  '.py', '.java', '.cpp', '.cs', '.rb', '.go', '.rs',
  '.sql', '.html', '.css', '.sh', '.yml', '.yaml'
];
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const ALL_ALLOWED_EXTENSIONS = [...ALLOWED_TEXT_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS];

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]);

interface ChatInputAreaProps {
  onSend: (message: string) => void;
  onFileSelect: (files: File[]) => void;
  onImageSelect: (images: File[]) => void;
  isStreaming: boolean;
  disabled: boolean;
  hasAttachedFiles: boolean;
  hasAttachedImages: boolean;
  onError?: (message: string) => void;
  onStorageClick?: () => void;
  onScrollToBottom?: () => void;
  storageButtonRef?: React.RefObject<HTMLButtonElement>;
}

export const ChatInputArea: React.FC<ChatInputAreaProps> = ({
  onSend,
  onFileSelect,
  onImageSelect,
  isStreaming,
  disabled,
  hasAttachedFiles,
  hasAttachedImages,
  onError,
  onStorageClick,
  onScrollToBottom,
  storageButtonRef,
}) => {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [lineCount, setLineCount] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0);
  const { registerInputRef } = useInputInjection();

  useEffect(() => {
    registerInputRef(textareaRef.current);
    return () => registerInputRef(null);
  }, [registerInputRef]);

  // Auto-focus on mobile
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && textareaRef.current && !disabled) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [disabled]);

  // Handle iOS keyboard appearance
  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isIOS) return;

    const handleFocus = () => {
      setTimeout(() => {
        textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    };

    const textarea = textareaRef.current;
    textarea?.addEventListener('focus', handleFocus);
    return () => textarea?.removeEventListener('focus', handleFocus);
  }, []);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const validateAndCategorizeFiles = (files: File[]) => {
    if (files.length > MAX_FILES) {
      return {
        textFiles: [],
        imageFiles: [],
        error: `Maximum ${MAX_FILES} files allowed.`
      };
    }

    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      return {
        textFiles: [],
        imageFiles: [],
        error: `Files must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
      };
    }

    const textFiles: File[] = [];
    const imageFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      const ext = ('.' + file.name.split('.').pop()?.toLowerCase()) || '';
      const mimeType = file.type;

      if (ALLOWED_TEXT_EXTENSIONS.includes(ext)) {
        textFiles.push(file);
      } else if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        imageFiles.push(file);
      } else if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        imageFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      return {
        textFiles: [],
        imageFiles: [],
        error: `Invalid file type(s): ${invalidFiles.join(', ')}`
      };
    }

    return { textFiles, imageFiles, error: null };
  };

  const processFiles = (files: File[]) => {
    const { textFiles, imageFiles, error } = validateAndCategorizeFiles(files);

    if (error) {
      setValidationError(error);
      onError?.(error);
      setTimeout(() => setValidationError(null), 5000);
    } else {
      if (textFiles.length > 0) onFileSelect(textFiles);
      if (imageFiles.length > 0) onImageSelect(imageFiles);
      setValidationError(null);
    }
  };

  const handleSubmit = () => {
    if (!disabled && (input.trim() || hasAttachedFiles || hasAttachedImages)) {
      onSend(input);
      setInput('');
      setValidationError(null);
      setCharCount(0);
      setLineCount(1);

      // Reset height immediately
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const timestamp = Date.now();
          const extension = item.type.split('/')[1] || 'png';
          imageFiles.push(new File([file], `pasted-image-${timestamp}.${extension}`, { type: item.type }));
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      processFiles(imageFiles);
    }
  };

  // Dynamic height adjustment
  const adjustHeight = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    
    // Calculate max height as 60% of viewport height (60vh)
    const maxHeight = window.innerHeight * 0.6;
    
    const newHeight = Math.max(
      MIN_TEXTAREA_HEIGHT,
      Math.min(element.scrollHeight, maxHeight)
    );
    
    element.style.height = `${newHeight}px`;
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setCharCount(value.length);
    setLineCount(value.split('\n').length);
    if (textareaRef.current) adjustHeight(textareaRef.current);
  };

  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== input) {
      setInput(textareaRef.current.value);
      adjustHeight(textareaRef.current);
    }
  }, [input]);

  // Drag and drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const files = Array.from(e.dataTransfer.files || []);
    processFiles(files);
  };

  const showMetadata = charCount > 50 || lineCount > 2;

  return (
    <div className="px-4 py-4 md:px-6 lg:px-8 ios-safe-bottom">
      <div className="max-w-4xl mx-auto relative">
        {/* Error Toast */}
        {validationError && (
          <div className="absolute -top-14 left-0 right-0 mx-auto w-max max-w-[90%] z-50">
            <div className="px-4 py-2 bg-red-500/90 text-white text-sm font-medium rounded-full shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
              <AlertCircle className="w-4 h-4" />
              <span>{validationError}</span>
              <button onClick={() => setValidationError(null)} className="ml-2 hover:text-white/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Main Input Container */}
        <div
          className={cn(
            "relative flex flex-col transition-all duration-300 ease-out",
            "rounded-[26px]", // Apple-style super-ellipse feel
            "bg-[#1c1c1e]/80 backdrop-blur-xl", // Deep frosted glass
            "border border-white/[0.08]",
            "shadow-[0_4px_24px_-1px_rgba(0,0,0,0.2)]", // Deep shadow
            isFocused && "border-white/20 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.3)] bg-[#1c1c1e]/90 ring-1 ring-white/10",
            isDragging && "border-blue-500/50 bg-blue-500/10 ring-4 ring-blue-500/20",
            disabled && "opacity-60 grayscale"
          )}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] bg-black/40 backdrop-blur-sm">
              <div className="flex flex-col items-center text-blue-400 animate-bounce">
                <Paperclip className="w-10 h-10 mb-2" />
                <span className="font-medium text-lg">Drop to attach</span>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALL_ALLOWED_EXTENSIONS.join(',')}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div className="flex items-end gap-3 p-3">
            {/* Attachment Button */}
            <button
              onClick={handleAttachClick}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 flex-shrink-0",
                "text-white/50 hover:text-white hover:bg-white/10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                disabled && "cursor-not-allowed"
              )}
              disabled={disabled}
              title="Attach files"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text Input */}
            <div className="flex-1 min-w-0 py-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={isStreaming ? 'Generating response...' : 'Message...'}
                disabled={disabled}
                rows={1}
                className={cn(
                  "w-full bg-transparent border-0 outline-none resize-none",
                  "text-[15px] leading-relaxed text-white/90 placeholder:text-white/30",
                  "font-normal tracking-wide", // Clean typography
                  "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20",
                  "selection:bg-blue-500/30 selection:text-blue-100"
                )}
                spellCheck={false}
                style={{
                  minHeight: `${MIN_TEXTAREA_HEIGHT - 16}px`, // Adjust for padding
                  maxHeight: '60vh' // Allow growing up to 60% of screen
                }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSubmit}
              disabled={disabled || (!input.trim() && !hasAttachedFiles && !hasAttachedImages)}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 flex-shrink-0",
                "shadow-lg hover:shadow-blue-500/20",
                disabled || (!input.trim() && !hasAttachedFiles && !hasAttachedImages)
                  ? "bg-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white text-black hover:scale-105 active:scale-95"
              )}
            >
              {isStreaming ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-0.5" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Footer Metadata (Collapsible) */}
          <div className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            showMetadata ? "max-h-8 opacity-100" : "max-h-0 opacity-0"
          )}>
            <div className="px-5 pb-2.5 flex items-center justify-between text-[11px] font-medium text-white/30 select-none">
              <div className="flex gap-3">
                <span>{charCount.toLocaleString()} chars</span>
                <span>{lineCount} lines</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">⌘</span>
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">↵</span>
                <span>to send</span>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Scroll Button */}
        {onScrollToBottom && (
          <button
            onClick={onScrollToBottom}
            className={cn(
              "absolute -top-14 left-1/2 -translate-x-1/2",
              "w-9 h-9 rounded-full flex items-center justify-center",
              "bg-[#1c1c1e] border border-white/10 text-white/70",
              "shadow-xl backdrop-blur-md hover:bg-white/10 hover:text-white",
              "transition-all duration-200 hover:scale-110 active:scale-95"
            )}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};