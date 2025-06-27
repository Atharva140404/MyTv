-- This script simplifies the video table structure to improve performance
-- It keeps only the essential columns: id, category_id, and url

-- First, backup the existing data (optional but recommended)
-- CREATE TABLE IF NOT EXISTS public.video_backup AS SELECT * FROM public.video;

-- Alter the video table to drop unnecessary columns
ALTER TABLE public.video 
DROP COLUMN IF EXISTS title,
DROP COLUMN IF EXISTS author_name,
DROP COLUMN IF EXISTS author_url,
DROP COLUMN IF EXISTS type,
DROP COLUMN IF EXISTS height,
DROP COLUMN IF EXISTS width,
DROP COLUMN IF EXISTS version,
DROP COLUMN IF EXISTS provider_name,
DROP COLUMN IF EXISTS thumbnail_url,
DROP COLUMN IF EXISTS thumbnail_height,
DROP COLUMN IF EXISTS thumbnail_width,
DROP COLUMN IF EXISTS html;

-- Keep only: id, category_id, url, created_at
-- These columns will remain in the table:
-- id UUID PRIMARY KEY
-- category_id UUID REFERENCES categories(id)
-- url TEXT
-- created_at TIMESTAMP WITH TIME ZONE

-- Make sure indexes are still in place
CREATE INDEX IF NOT EXISTS video_category_id_idx ON public.video(category_id);
CREATE INDEX IF NOT EXISTS video_url_idx ON public.video(url);

-- Note: This script will permanently remove data in the dropped columns
-- Make sure your application code is updated to handle this change 