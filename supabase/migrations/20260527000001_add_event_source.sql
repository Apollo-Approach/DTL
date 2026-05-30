ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS event_source_type text,
ADD COLUMN IF NOT EXISTS event_source_url text;

COMMENT ON COLUMN public.venues.event_source_type IS 'Type of the primary event source (e.g., Website, Facebook, Instagram, Eventbrite, Ticketmaster)';
COMMENT ON COLUMN public.venues.event_source_url IS 'URL to the primary event source';
