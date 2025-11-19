import React, { useState, useRef, ChangeEvent, DragEvent, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Upload, Paperclip, Database, AlertCircle, Code, File, Table, Settings, LucideIcon } from 'lucide-react';

interface FilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (files: File[]) => void;
  onStorageClick?: () => void;
}

// Increased limits
const MAX_FILES = 15;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Organized and expanded file types
interface FileCategory {
    label: string;
    icon: LucideIcon;
    color: string;
    extensions: string[];
}

const FILE_CATEGORIES: Record<string, FileCategory> = {
  DOCUMENTS: {
    label: 'Documents',
    icon: File,
    color: 'text-blue-400',
    extensions: [
      '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md', '.rtf', '.odt'
    ],
  },
  DATA: {
    label: 'Data & Spreadsheets',
    icon: Table,
    color: 'text-green-400',
    extensions: [
        '.csv', '.xls', '.xlsx', '.json', '.xml', '.sql', '.tsv'
    ],
  },
  CODE: {
    label: 'Code & Scripts',
    icon: Code,
    color: 'text-purple-400',
    extensions: [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h',
      '.cs', '.rb', '.go', '.rs', '.swift', '.kt', '.php',
      '.html', '.css', '.scss', '.sh', '.bash'
    ],
  },
  CONFIG: {
    label: 'Configuration',
    icon: Settings,
    color: 'text-yellow-400',
    extensions: [
        '.yml', '.yaml', '.toml', '.ini', '.env', '.properties'
    ],
  },
};

// Flatten the extensions for validation and the accept attribute
const ALL_ALLOWED_EXTENSIONS = Object.values(FILE_CATEGORIES).flatMap(cat => cat.extensions);

export const FilesModal: React.FC<FilesModalProps> = ({
  isOpen,
  onClose,
  onFileSelect,
  onStorageClick,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const fileSizeInMB = useMemo(() => MAX_FILE_SIZE / (1024 * 1024), []);

  // Standardized Modal behavior effects (Matches Sidebar.tsx Modal)
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        modalRef.current?.focus();
        setValidationError(null); // Clear errors when opening
    }

    return () => {
        document.removeEventListener('keydown', handleEscape);
        // Ensure overflow is reset when modal closes
        if (isOpen) {
            document.body.style.overflow = 'unset';
        }
    };
  }, [isOpen, onClose]);

  const validateFiles = (files: File[]): { valid: File[]; error: string | null } => {
    // 1. Check file count
    if (files.length > MAX_FILES) {
      return {
        valid: [],
        error: `Maximum ${MAX_FILES} files allowed. You tried to upload ${files.length}.`
      };
    }

    // 2. Check file sizes
    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      return {
        valid: [],
        error: `Files must be under ${fileSizeInMB}MB. Found ${oversizedFiles.length} oversized file(s).`
      };
    }

    // 3. Check file extensions
    const invalidFiles = files.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return !ALL_ALLOWED_EXTENSIONS.includes(ext);
    });

    if (invalidFiles.length > 0) {
        // Create a concise error message listing the invalid extensions found
        const invalidExtensions = [...new Set(invalidFiles.map(f => '.' + f.name.split('.').pop()?.toLowerCase()))];
      return {
        valid: [],
        error: `Unsupported file type(s): ${invalidExtensions.join(', ')}. Please check the allowed formats below.`
      };
    }

    return { valid: files, error: null };
  };

  // Consolidated file handling logic
  const handleFiles = (files: File[]) => {
    const { valid, error } = validateFiles(files);

    if (error) {
      setValidationError(error);
      // Keep the error visible for 6 seconds
      setTimeout(() => setValidationError(null), 6000);
    } else if (valid.length > 0) {
      onFileSelect(valid);
      onClose();
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);

    // Reset input value
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  };

  if (!isOpen) return null;

  // Using React Portal and standardized structure
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
        {/* Modal Container: Matches standardized design (bg-[#101010], rounded-3xl). Using max-w-4xl. */}
        <div className="relative bg-[#101010] border border-white/[0.15] rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden transition-transform duration-300 ease-out max-h-[90vh]"
            onClick={e => e.stopPropagation()}
        >

            {/* Header (Matches standardized design) */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#101010] z-10">
                <div className="flex flex-col">
                    <h2 className="text-xl font-semibold text-white">Files & Storage</h2>
                    <p className="text-sm text-white/60">Upload files for analysis or access saved data</p>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all duration-200"
                    aria-label="Close Modal"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Content Area - Two Column Layout */}
            <div className="p-6 flex flex-col lg:flex-row gap-6 overflow-y-auto">
          
          {/* Left Column: Upload Area */}
          <div className="flex-1 space-y-4">
             {/* Validation Error Display */}
            {validationError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 transition-all duration-300">
                <AlertCircle className="size-5 text-red-400 shrink-0 mt-0.5" strokeWidth={2} />
                <div>
                  <p className="text-sm font-medium text-red-300">{validationError}</p>
                </div>
              </div>
            )}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 h-full min-h-[300px] flex flex-col justify-center
                ${isDragging
                  ? 'border-blue-500/60 bg-blue-500/10'
                  : 'border-white/[0.1] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.15]'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALL_ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileChange}
                className="hidden"
                aria-label="File input"
              />

              <div className="flex flex-col items-center gap-5">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-300 ${isDragging ? 'bg-blue-500/20' : 'bg-white/[0.05]'}`}>
                  <Upload className={`size-8 ${isDragging ? 'text-blue-400' : 'text-white/40'}`} strokeWidth={1.5} />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white/90 mb-2">
                    {isDragging ? 'Release to Upload' : 'Drag & Drop Your Files'}
                  </h3>
                  <p className="text-sm text-white/50 mb-6">
                    or click the button below to browse
                  </p>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-2.5 bg-white text-black hover:bg-white/95 rounded-full text-sm font-medium transition-all duration-200 inline-flex items-center gap-2 shadow-md"
                  >
                    <Paperclip className="size-4" strokeWidth={2} />
                    Choose Files
                  </button>
                </div>

                <div className="mt-6 text-xs text-white/40">
                  <p>Max {MAX_FILES} files, up to {fileSizeInMB}MB each</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Info & Storage Sidebar */}
          <div className="w-full lg:w-72 space-y-4 shrink-0">
            
            {/* Supported File Types Info */}
            <div className='bg-white/[0.03] border border-white/[0.06] rounded-xl p-5'>
                <h4 className="text-base font-semibold text-white/90 mb-4">Supported File Types</h4>
                <div className="space-y-4">
                    {Object.values(FILE_CATEGORIES).map((category) => (
                    <div key={category.label} className="flex items-start gap-3">
                        <div className='pt-0.5'>
                            <category.icon className={`size-5 ${category.color}`} strokeWidth={2} />
                        </div>
                        <div className='flex-1'>
                            <p className="text-sm font-medium text-white/80">{category.label}</p>
                            <p className="text-xs font-mono text-white/50 mt-1 break-words leading-relaxed">
                                {category.extensions.join(', ')}
                            </p>
                        </div>
                    </div>
                    ))}
                </div>
            </div>

            {/* Storage Access (Optional) */}
            {onStorageClick && (
              <button
                onClick={() => {
                  onStorageClick();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.1] hover:border-white/[0.15] rounded-xl transition-all duration-200 text-left"
              >
                <div className="w-12 h-12 bg-white/[0.08] rounded-xl flex items-center justify-center shrink-0">
                  <Database className="size-6 text-white/70" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-white/90 mb-0.5">Saved Schemas</h3>
                  <p className="text-xs text-white/50">Access previously extracted data</p>
                </div>
              </button>
            )}
          </div>

            </div>
        </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};