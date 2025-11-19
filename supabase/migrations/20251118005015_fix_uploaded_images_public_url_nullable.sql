-- Fix uploaded_images table for private bucket usage
-- Make public_url nullable since private buckets use signed URLs instead

ALTER TABLE public.uploaded_images 
ALTER COLUMN public_url DROP NOT NULL;
