-- Migration: Create eventbrite_organizers table

CREATE TABLE IF NOT EXISTS public.eventbrite_organizers (
    id TEXT PRIMARY KEY,
    name TEXT,
    discovery_source TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_scraped_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS but allow unrestricted reads
ALTER TABLE public.eventbrite_organizers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on eventbrite_organizers"
    ON public.eventbrite_organizers
    FOR SELECT
    USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access on eventbrite_organizers"
    ON public.eventbrite_organizers
    FOR ALL
    USING (auth.role() = 'service_role');
