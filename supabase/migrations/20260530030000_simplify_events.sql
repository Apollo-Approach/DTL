-- supabase/migrations/20260530030000_simplify_events.sql
-- Simplifies the events table to only track Event Name, Venue, Date, Start Time, and Best Link

-- 1. Rename ticket_url to best_link
ALTER TABLE public.events RENAME COLUMN ticket_url TO best_link;

-- 2. Drop the events_public view because it depends on the columns we are about to drop
DROP VIEW IF EXISTS public.events_public;

-- 3. Drop all unused classifications
ALTER TABLE public.events 
  DROP COLUMN IF EXISTS end_time,
  DROP COLUMN IF EXISTS is_free,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS categories,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS source_platform,
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS age_restriction,
  DROP COLUMN IF EXISTS door_time,
  DROP COLUMN IF EXISTS venue_subroom,
  DROP COLUMN IF EXISTS offerings;

-- 4. Recreate the events_public view with only the retained columns
CREATE VIEW public.events_public AS
SELECT 
    id, 
    name, 
    venue_id, 
    start_time, 
    best_link, 
    dedup_hash, 
    admin_verified
FROM public.events;
