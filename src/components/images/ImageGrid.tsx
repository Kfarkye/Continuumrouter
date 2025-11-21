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

    // Single image - full width, ChatGPT style
    if (count === 1) {
      const img = images[0];
      return (
        <div className="max-w-[500px]">
          <ProgressiveImage
            src={img.url}
            thumbnail={img.thumbnail_url}
            alt={img.filename}
            width={img.width}
            height={img.height}
            onClick={() => handleImageClick(0)}
            objectFit="contain"
          />
        </div>
      );
    }

    // Two images - side by side
    if (count === 2) {
      return (
        <div className="flex gap-1 max-w-[500px]">
          {images.map((img, index) => (
            <div key={index} className="flex-1">
              <ProgressiveImage
                src={img.url}
                thumbnail={img.thumbnail_url}
                alt={img.filename}
                width={img.width}
                height={img.height}
                onClick={() => handleImageClick(index)}
                objectFit="cover"
                className="aspect-[3/4]"
              />
            </div>
          ))}
        </div>
      );
    }

    // Three images - one large, two small
    if (count === 3) {
      return (
        <div className="flex gap-1 max-w-[500px]">
          <div className="flex-1">
            <ProgressiveImage
              src={images[0].url}
              thumbnail={images[0].thumbnail_url}
              alt={images[0].filename}
              width={images[0].width}
              height={images[0].height}
              onClick={() => handleImageClick(0)}
              objectFit="cover"
              className="h-full"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            {images.slice(1).map((img, index) => (
              <ProgressiveImage
                key={index + 1}
                src={img.url}
                thumbnail={img.thumbnail_url}
                alt={img.filename}
                width={img.width}
                height={img.height}
                onClick={() => handleImageClick(index + 1)}
                objectFit="cover"
                className="flex-1"
              />
            ))}
          </div>
        </div>
      );
    }

    // Four images - 2x2 grid
    if (count === 4) {
      return (
        <div className="grid grid-cols-2 gap-1 max-w-[500px]">
          {images.map((img, index) => (
            <ProgressiveImage
              key={index}
              src={img.url}
              thumbnail={img.thumbnail_url}
              alt={img.filename}
              width={img.width}
              height={img.height}
              onClick={() => handleImageClick(index)}
              objectFit="cover"
              className="aspect-square"
            />
          ))}
        </div>
      );
    }

    // More than 4 - show first 4 with +N overlay
    return (
      <div className="grid grid-cols-2 gap-1 max-w-[500px]">
        {images.slice(0, 3).map((img, index) => (
          <ProgressiveImage
            key={index}
            src={img.url}
            thumbnail={img.thumbnail_url}
            alt={img.filename}
            width={img.width}
            height={img.height}
            onClick={() => handleImageClick(index)}
            objectFit="cover"
            className="aspect-square"
          />
        ))}
        {count > 3 && (
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
              objectFit="cover"
            />
            {count > 4 && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center rounded-lg">
                <span className="text-white text-2xl font-medium">
                  +{count - 4}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={cn('my-2', className)}>{renderImages()}</div>

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
