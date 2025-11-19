import React, { useState } from 'react';
import { ProgressiveImage } from './ProgressiveImage';
import { ImageLightbox } from './ImageLightbox';
import { cn } from '../../lib/utils';

interface ImageGridProps {
  images: Array<{
    url: string;
    thumbnail_url?: string;
    filename: string;
    width?: number;
    height?: number;
  }>;
  className?: string;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ images, className }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const handleNavigate = (index: number) => {
    setCurrentImageIndex(index);
  };

  const lightboxImages = images.map((img) => ({
    url: img.url,
    alt: img.filename,
    filename: img.filename,
  }));

  const renderImages = () => {
    const count = images.length;

    if (count === 1) {
      const img = images[0];
      return (
        <div className="max-w-[600px]">
          <ProgressiveImage
            src={img.url}
            thumbnail={img.thumbnail_url}
            alt={img.filename}
            width={img.width}
            height={img.height}
            onClick={() => handleImageClick(0)}
          />
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-2 max-w-[600px]">
          {images.map((img, index) => (
            <ProgressiveImage
              key={index}
              src={img.url}
              thumbnail={img.thumbnail_url}
              alt={img.filename}
              width={img.width}
              height={img.height}
              onClick={() => handleImageClick(index)}
              className="aspect-square"
            />
          ))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className="grid grid-cols-2 gap-2 max-w-[600px]">
          <ProgressiveImage
            src={images[0].url}
            thumbnail={images[0].thumbnail_url}
            alt={images[0].filename}
            width={images[0].width}
            height={images[0].height}
            onClick={() => handleImageClick(0)}
            className="col-span-2"
          />
          {images.slice(1).map((img, index) => (
            <ProgressiveImage
              key={index + 1}
              src={img.url}
              thumbnail={img.thumbnail_url}
              alt={img.filename}
              width={img.width}
              height={img.height}
              onClick={() => handleImageClick(index + 1)}
              className="aspect-square"
            />
          ))}
        </div>
      );
    }

    if (count === 4) {
      return (
        <div className="grid grid-cols-2 gap-2 max-w-[600px]">
          {images.map((img, index) => (
            <ProgressiveImage
              key={index}
              src={img.url}
              thumbnail={img.thumbnail_url}
              alt={img.filename}
              width={img.width}
              height={img.height}
              onClick={() => handleImageClick(index)}
              className="aspect-square"
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 max-w-[600px]">
        {images.slice(0, 3).map((img, index) => (
          <ProgressiveImage
            key={index}
            src={img.url}
            thumbnail={img.thumbnail_url}
            alt={img.filename}
            width={img.width}
            height={img.height}
            onClick={() => handleImageClick(index)}
            className={cn(
              'aspect-square',
              index === 0 && 'col-span-2'
            )}
          />
        ))}
        {count > 4 && (
          <div
            className="relative aspect-square cursor-pointer"
            onClick={() => handleImageClick(3)}
          >
            <ProgressiveImage
              src={images[3].url}
              thumbnail={images[3].thumbnail_url}
              alt={images[3].filename}
              width={images[3].width}
              height={images[3].height}
            />
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-xl">
              <span className="text-white text-3xl font-semibold">
                +{count - 4}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={cn('my-3', className)}>{renderImages()}</div>

      <ImageLightbox
        isOpen={lightboxOpen}
        images={lightboxImages}
        currentIndex={currentImageIndex}
        onClose={() => setLightboxOpen(false)}
        onNavigate={handleNavigate}
      />
    </>
  );
};
