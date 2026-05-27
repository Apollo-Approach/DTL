-- Migration: Add eventbrite_organizer_id to venues

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS eventbrite_organizer_id TEXT;
