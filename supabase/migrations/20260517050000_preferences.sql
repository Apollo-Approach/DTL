-- supabase/migrations/20260517050000_preferences.sql

-- 1. Add preferences to User Profiles
ALTER TABLE public.profiles 
ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb,
ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Add offerings to Venues and Events
ALTER TABLE public.venues
ADD COLUMN offerings JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.events
ADD COLUMN offerings JSONB DEFAULT '{}'::jsonb;

-- 3. Update public view for Venues to include offerings
DROP VIEW IF EXISTS public.venues_public;
CREATE VIEW public.venues_public AS
SELECT 
    id, name, description, address, status, type,
    operating_hours, website_url, late_night_eligible,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng,
    offerings
FROM public.venues;

-- 4. Update public view for Events to include offerings
DROP VIEW IF EXISTS public.events_public;
CREATE VIEW public.events_public AS
SELECT 
    e.id, e.name, e.venue_id, e.start_time, e.end_time, e.is_free, e.price, e.categories, e.description, e.ticket_url, e.offerings,
    ST_Y(e.location::geometry) as lat,
    ST_X(e.location::geometry) as lng
FROM public.events e;
