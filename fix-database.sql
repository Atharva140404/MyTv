-- This script fixes the Supabase database structure for MyTV app

-- First, create the categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Then create the video table with proper references
-- Drop the existing table if it has issues
DROP TABLE IF EXISTS public.video;

-- Create the video table with the proper structure
CREATE TABLE public.video (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    author_name TEXT,
    author_url TEXT,
    type TEXT,
    height INTEGER,
    width INTEGER,
    version TEXT,
    provider_name TEXT,
    -- provider_url column has been merged with url
    thumbnail_url TEXT,
    thumbnail_height INTEGER,
    thumbnail_width INTEGER,
    html TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS video_category_id_idx ON public.video(category_id);
CREATE INDEX IF NOT EXISTS video_url_idx ON public.video(url);

-- Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all operations for now)
CREATE POLICY "Allow all categories operations" ON public.categories FOR ALL USING (true);
CREATE POLICY "Allow all video operations" ON public.video FOR ALL USING (true);

-- Grant access to the anon role
GRANT ALL ON public.categories TO anon;
GRANT ALL ON public.video TO anon;
GRANT ALL ON public.categories TO authenticated;
GRANT ALL ON public.video TO authenticated; 