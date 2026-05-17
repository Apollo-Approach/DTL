-- supabase/migrations/20260517_01_venue_enrichment.sql

-- 1. Add new columns to venues
ALTER TABLE public.venues 
ADD COLUMN type TEXT,
ADD COLUMN operating_hours JSONB,
ADD COLUMN website_url TEXT,
ADD COLUMN late_night_eligible BOOLEAN NOT NULL DEFAULT false;

-- 2. Update the public view to expose these new columns
DROP VIEW IF EXISTS public.venues_public;
CREATE OR REPLACE VIEW public.venues_public AS
SELECT 
    id, name, description, address, status, type,
    operating_hours, website_url, late_night_eligible,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.venues;
