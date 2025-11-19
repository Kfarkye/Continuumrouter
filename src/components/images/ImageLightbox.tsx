import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageLightboxProps {
  isOpen: boolean;
  images: Array<{ url: string; alt: string; filename?: string }>;
  currentIndex: number;
  onClose: () => void;
  onNavigate?: (index: number) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  images,
  currentIndex,
  onClose,
  onNavigate,
}) => {
  const [zoom, setZoom] = React.useState(1);
  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  const handlePrevious = useCallback(() => {
    if (hasMultiple && onNavigate) {
      const newIndex = currentIndex > 0 ? currentIndex - 1 : images.length - 1;
      onNavigate(newIndex);
      setZoom(1);
    }
  }, [currentIndex, images.length, hasMultiple, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasMultiple && onNavigate) {
      const newIndex = currentIndex < images.length - 1 ? currentIndex + 1 : 0;
      onNavigate(newIndex);
      setZoom(1);
    }
  }, [currentIndex, images.length, hasMultiple, onNavigate]);

  const handleDownload = useCallback(async () => {
    if (!currentImage) return;

    try {
      const response = await fetch(currentImage.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentImage.filename || 'image.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, [currentImage]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case 'd':
        case 'D':
          handleDownload();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
        case '_':
          handleZoomOut();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, handlePrevious, handleNext, handleDownload, handleZoomIn, handleZoomOut]);

  if (!isOpen || !currentImage) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            {currentImage.filename && (
              <span className="text-white/90 text-sm font-medium">
                {currentImage.filename}
              </span>
            )}
            {hasMultiple && (
              <span className="text-white/60 text-sm">
                {currentIndex + 1} / {images.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }}
              className="touch-target flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Zoom out"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-5 h-5 text-white" />
            </button>

            <span className="text-white/60 text-sm min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }}
              className="touch-target flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Zoom in"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="touch-target flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Download"
              title="Download (D)"
            >
              <Download className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="touch-target flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close"
              title="Close (ESC)"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div className="absolute inset-0 flex items-center justify-center p-4 pt-20 pb-20">
          <motion.img
            key={currentImage.url}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: zoom }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            src={currentImage.url}
            alt={currentImage.alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
            style={{
              cursor: zoom > 1 ? 'grab' : 'default',
            }}
          />
        </div>

        {/* Navigation */}
        {hasMultiple && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              className="touch-target absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Previous image"
              title="Previous (←)"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="touch-target absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Next image"
              title="Next (→)"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </>
        )}

        {/* Hint */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-sm">
          Press ESC to close {hasMultiple && '• Arrow keys to navigate'} • D to download
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};
