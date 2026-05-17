-- supabase/migrations/20260517_03_broll.sql

CREATE TABLE public.broll_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds INTEGER,
    tags TEXT[] NOT NULL DEFAULT '{}',
    is_approved BOOLEAN NOT NULL DEFAULT false,
    uploader_id TEXT
);

-- Enable RLS
ALTER TABLE public.broll_clips ENABLE ROW LEVEL SECURITY;

-- Create policy for public read of approved clips
CREATE POLICY "Approved broll clips are publicly viewable"
ON public.broll_clips FOR SELECT
USING (is_approved = true);

-- Create policy for inserts
CREATE POLICY "Anyone can upload broll clips"
ON public.broll_clips FOR INSERT
WITH CHECK (true);
