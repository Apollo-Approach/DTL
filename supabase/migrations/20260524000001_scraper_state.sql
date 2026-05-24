-- Migration: Create scraper_state table for caching HTML responses

CREATE TABLE IF NOT EXISTS public.scraper_state (
    id TEXT PRIMARY KEY,
    etag TEXT,
    content_hash TEXT,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.scraper_state ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Allow service role full access on scraper_state"
    ON public.scraper_state
    FOR ALL
    USING (auth.role() = 'service_role');
