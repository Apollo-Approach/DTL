-- supabase/migrations/20260517_02_events.sql

-- 1. Add ticket_url to events table (which was created in init_schema)
ALTER TABLE public.events 
ADD COLUMN ticket_url TEXT;

-- 2. Create the public view for easy querying
CREATE OR REPLACE VIEW public.events_public AS
SELECT 
    id, name, venue_id, start_time, end_time, is_free, price, categories, description, ticket_url,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.events;
