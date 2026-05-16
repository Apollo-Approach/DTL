-- supabase/migrations/20260513_03_social_media.sql

CREATE TYPE media_platform AS ENUM ('INSTAGRAM', 'TIKTOK', 'LOCAL_WEB');
CREATE TYPE media_type AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL');

CREATE TABLE public.social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform media_platform NOT NULL DEFAULT 'INSTAGRAM',
    external_id TEXT UNIQUE NOT NULL, -- To prevent duplicate webhook inserts
    username TEXT NOT NULL,
    media_type media_type NOT NULL,
    media_url TEXT NOT NULL,
    permalink TEXT NOT NULL,
    caption TEXT,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for chronological feed queries
CREATE INDEX social_posts_posted_at_idx ON public.social_posts (posted_at DESC);

-- Enable RLS
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for the frontend feed)
CREATE POLICY "Allow public read access on social posts" ON public.social_posts FOR SELECT USING (true);
-- Webhook will use the Service Role Key to insert, so NO public insert policy is needed. Secure!

-- Enable Realtime for the social feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_posts;
