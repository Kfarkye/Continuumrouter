import { getSupabase } from './supabaseClient';

const BUCKET_NAME = 'chat-uploads';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
// HARDENING: More aggressive compression for Edge Function performance
const COMPRESSION_THRESHOLD = 1 * 1024 * 1024; // 1MB (reduced from 2MB)
const COMPRESSION_QUALITY = 0.85;

export interface ImageMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
}

export interface UploadedImage {
  id: string;
  storage_path: string;
  signed_url: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
}

export interface ImageUploadResult {
  success: boolean;
  image?: UploadedImage;
  error?: string;
}

function generateSecureFilename(originalName: string, userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  return `${userId}/${timestamp}_${random}.${extension}`;
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

// HARDENING: Reduced max width to 1536px to reduce token consumption and Edge Function memory
async function compressImage(file: File, maxWidth = 1536, quality = COMPRESSION_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}

export async function uploadImage(
  file: File,
  userId: string,
  sessionId: string,
  conversationId?: string
): Promise<ImageUploadResult> {
  try {
    if (file.size > MAX_IMAGE_SIZE) {
      return {
        success: false,
        error: `Image size exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`,
      };
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WEBP',
      };
    }

    const dimensions = await getImageDimensions(file);

    if (dimensions.width > 8000 || dimensions.height > 8000) {
      return {
        success: false,
        error: 'Image dimensions too large (max 8000x8000)',
      };
    }

    let uploadFile: File | Blob = file;
    let finalSize = file.size;

    if (file.size > COMPRESSION_THRESHOLD) {
      const compressed = await compressImage(file);
      if (compressed.size < file.size) {
        uploadFile = compressed;
        finalSize = compressed.size;
      }
    }

    const supabase = getSupabase();
    const storagePath = generateSecureFilename(file.name, userId);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, uploadFile, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return {
        success: false,
        error: `Upload failed: ${uploadError.message}`,
      };
    }

    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedUrlData) {
      console.error('Signed URL error:', signedError);
      await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
      return {
        success: false,
        error: `Failed to generate signed URL: ${signedError?.message}`,
      };
    }

    const signedUrl = signedUrlData.signedUrl;

    const { data: insertData, error: insertError } = await supabase
      .from('uploaded_images')
      .insert({
        user_id: userId,
        session_id: sessionId,
        conversation_id: conversationId,
        storage_path: storagePath,
        signed_url: signedUrl,
        original_filename: file.name,
        file_size: finalSize,
        mime_type: file.type,
        width: dimensions.width,
        height: dimensions.height,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
      return {
        success: false,
        error: `Database error: ${insertError.message}`,
      };
    }

    return {
      success: true,
      image: insertData as UploadedImage,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export function createImagePreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeImagePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
