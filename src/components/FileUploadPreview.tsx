import React, { useEffect, useState } from 'react';
import { X, FileText, Image as ImageIcon, RotateCw } from 'lucide-react';
import { ImageAttachment, LocalFileAttachment } from '../types';
import { createImagePreviewUrl, revokeImagePreviewUrl } from '../lib/imageStorageService';
import { formatFileSize } from '../lib/utils';

interface FileUploadPreviewProps {
  localFiles?: LocalFileAttachment[];
  imageAttachments?: ImageAttachment[];
  files?: File[];
  images?: File[];
  onRemoveFileById?: (tempId: string) => void;
  onRemoveImageById?: (tempId: string) => void;
  onRemove?: (index: number) => void;
  onRemoveImage?: (index: number) => void;
  onClear: () => void;
  onRetryUpload?: (tempId: string) => void;
}

export const FileUploadPreview: React.FC<FileUploadPreviewProps> = ({
  localFiles = [],
  imageAttachments = [],
  files = [],
  images = [],
  onRemoveFileById,
  onRemoveImageById,
  onRemove,
  onRemoveImage,
  onClear,
  onRetryUpload
}) => {
  const [legacyImagePreviews, setLegacyImagePreviews] = useState<Map<string, string>>(new Map());

  // Handle legacy image previews
  useEffect(() => {
    if (images.length > 0) {
      const newPreviews = new Map<string, string>();

      images.forEach((image) => {
        const url = createImagePreviewUrl(image);
        newPreviews.set(image.name, url);
      });

      setLegacyImagePreviews(newPreviews);

      return () => {
        newPreviews.forEach((url) => revokeImagePreviewUrl(url));
      };
    }
  }, [images]);

  // Calculate totals
  const totalFiles = localFiles.length + files.length + imageAttachments.length + images.length;

  const totalSize = [
    ...localFiles.map(lf => lf.file.size),
    ...files.map(f => f.size),
    ...imageAttachments.map(ia => ia.size),
    ...images.map(i => i.size)
  ].reduce((sum, size) => sum + size, 0);

  if (totalFiles === 0) return null;

  const hasUploadProgress = imageAttachments.some(att => att.uploadProgress !== undefined && att.uploadProgress < 100);

  return (
    <div className="border-t border-white/5 bg-zinc-900/50 backdrop-blur-sm">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-medium text-zinc-300">
          {(imageAttachments.length > 0 || images.length > 0) && (
            <span>
              {imageAttachments.length + images.length} image{(imageAttachments.length + images.length) !== 1 ? 's' : ''}
              {(localFiles.length > 0 || files.length > 0) && ', '}
            </span>
          )}
          {(localFiles.length > 0 || files.length > 0) && (
            <span>
              {localFiles.length + files.length} file{(localFiles.length + files.length) !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <button
          onClick={onClear}
          className="text-sm text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
          title="Remove all"
          aria-label="Remove all attachments"
        >
          Clear all
        </button>
      </div>

      {/* CRITICAL: Scrollable preview area with max-height constraint for portrait view */}
      <div className="px-4 pb-3 max-h-[30vh] overflow-y-auto ios-safe-bottom custom-scrollbar">
        {/* New ImageAttachment rendering (with tempId support) */}
        {imageAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {imageAttachments.map((attachment) => {
              const uploadProgress = attachment.uploadProgress;
              const uploadError = attachment.uploadError;

              return (
                <div key={attachment.tempId} className="relative group">
                  {/* CRITICAL: Fixed size thumbnail (w-16 h-16 = 64px) */}
                  {attachment.url && (
                    <img
                      src={attachment.url}
                      alt={attachment.filename}
                      className="w-16 h-16 object-cover rounded-lg border border-white/10 bg-zinc-800"
                      loading="lazy"
                    />
                  )}

                  {/* Upload progress overlay */}
                  {uploadProgress !== undefined && uploadProgress < 100 && !uploadError && (
                    <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                      <div className="w-full px-2">
                        <div className="w-full bg-zinc-700 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-blue-500 h-1 transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload error overlay */}
                  {uploadError && (
                    <div className="absolute inset-0 bg-red-500/20 rounded-lg flex flex-col items-center justify-center gap-1 p-1">
                      <span className="text-[10px] text-red-400 font-medium">Failed</span>
                      {onRetryUpload && !attachment.isUploading && (
                        <button
                          onClick={() => onRetryUpload(attachment.tempId)}
                          className="text-[10px] text-white bg-red-600 px-2 py-0.5 rounded flex items-center gap-1 hover:bg-red-500 transition-colors"
                          title={uploadError}
                          aria-label="Retry upload"
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => onRemoveImageById?.(attachment.tempId)}
                    disabled={attachment.isUploading}
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      attachment.isUploading
                        ? 'bg-zinc-700 cursor-not-allowed'
                        : 'bg-red-500 hover:bg-red-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                    title="Remove image"
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy image rendering (for backward compatibility) */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {images.map((image, index) => {
              const previewUrl = legacyImagePreviews.get(image.name);

              return (
                <div key={`legacy-image-${index}`} className="relative group">
                  {/* CRITICAL: Fixed size thumbnail (w-16 h-16 = 64px) */}
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={image.name}
                      className="w-16 h-16 object-cover rounded-lg border border-white/10 bg-zinc-800"
                      loading="lazy"
                    />
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => onRemoveImage?.(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="Remove image"
                    aria-label={`Remove ${image.name}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* New LocalFileAttachment rendering (with tempId support) */}
        {localFiles.length > 0 && (
          <div className="space-y-2">
            {localFiles.map((localFile) => (
              <div
                key={localFile.tempId}
                className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg border border-white/5"
              >
                <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">
                    {localFile.file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatFileSize(localFile.file.size)}
                  </p>
                </div>
                {onRemoveFileById && (
                  <button
                    onClick={() => onRemoveFileById(localFile.tempId)}
                    className="p-1 hover:bg-red-500/10 rounded text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                    title="Remove file"
                    aria-label={`Remove ${localFile.file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Legacy file rendering (for backward compatibility) */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`legacy-file-${index}`}
                className="flex items-center gap-3 p-2 bg-zinc-800/50 rounded-lg border border-white/5"
              >
                <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {onRemove && (
                  <button
                    onClick={() => onRemove(index)}
                    className="p-1 hover:bg-red-500/10 rounded text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                    title="Remove file"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {hasUploadProgress && (
        <div className="px-4 pb-2 text-sm text-zinc-400" role="status" aria-live="polite">
          Uploading images...
        </div>
      )}
    </div>
  );
};
