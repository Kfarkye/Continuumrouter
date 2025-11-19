import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface ProgressiveImageProps {
  src: string;
  alt: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  onLoad?: () => void;
  onError?: () => void;
  onClick?: () => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  thumbnail,
  width,
  height,
  className = '',
  objectFit = 'cover',
  onLoad,
  onError,
  onClick,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const aspectRatio = width && height ? (height / width) * 100 : 56.25;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '500px',
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleLoad = () => {
    setImageLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setImageError(true);
    onError?.();
  };

  if (imageError) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'relative w-full bg-zinc-900/50 border border-white/10 rounded-xl flex items-center justify-center',
          className
        )}
        style={{ paddingBottom: `${aspectRatio}%` }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40">
          <svg
            className="w-12 h-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-sm">Image failed to load</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-zinc-900/20',
        onClick && 'cursor-pointer hover:opacity-95 transition-opacity',
        className
      )}
      style={{ paddingBottom: `${aspectRatio}%` }}
      onClick={onClick}
    >
      {thumbnail && !imageLoaded && (
        <img
          src={thumbnail}
          alt={`${alt} thumbnail`}
          className="absolute inset-0 w-full h-full blur-xl scale-110 transition-opacity duration-300"
          style={{ objectFit }}
          aria-hidden="true"
        />
      )}

      {!imageLoaded && !thumbnail && (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 animate-pulse" />
      )}

      {isInView && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          style={{ objectFit }}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}

      {!imageLoaded && isInView && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
