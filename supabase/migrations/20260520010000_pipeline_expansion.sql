-- supabase/migrations/20260520_pipeline_expansion.sql
-- Phase 1: Events + Promotions Pipeline Expansion

-- 1. Extend events table with source tracking + dedup
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS age_restriction TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS door_time TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_subroom TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dedup_hash TEXT UNIQUE;

-- 2. Recreate events_public view with new columns
DROP VIEW IF EXISTS public.events_public;
CREATE VIEW public.events_public AS
SELECT 
    id, name, venue_id, start_time, end_time, is_free, price, categories, description, ticket_url, offerings,
    source_platform, source_url, image_url, age_restriction, door_time, venue_subroom, dedup_hash,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.events;

-- 3. Extend promotions for recurring weekly specials
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS recurring_day TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS active_from_time TIME;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS active_until_time TIME;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS dedup_hash TEXT UNIQUE;

-- 4. Add needs_enrichment flag to venues for auto-created stubs
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS needs_enrichment BOOLEAN DEFAULT false;
