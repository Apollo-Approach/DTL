-- supabase/migrations/20260513_init_schema.sql

-- Enable PostGIS spatial extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create Enums
CREATE TYPE event_category AS ENUM (
    'LIVE_MUSIC', 'DJ_CLUB', 'DINING_DRINKS', 
    'ARTS_THEATRE', 'COMMUNITY', 'CIVIC'
);

-- Create Venues Table
CREATE TABLE public.venues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    address TEXT NOT NULL,
    -- PostGIS geography type for accurate earth-surface distance calculations
    location GEOGRAPHY(POINT, 4326) NOT NULL 
);

-- Create Events Table
CREATE TABLE public.events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    venue_id TEXT REFERENCES public.venues(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_free BOOLEAN NOT NULL DEFAULT FALSE,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    categories event_category[] NOT NULL,
    description TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL
);

-- Spatial Indexes for lightning-fast map queries
CREATE INDEX venues_location_idx ON public.venues USING GIST (location);
CREATE INDEX events_location_idx ON public.events USING GIST (location);

-- Create an API-friendly View for the Next.js Frontend
-- Supabase returns raw PostGIS data as a hex string by default. 
-- This View automatically extracts lat/lng so our frontend doesn't have to parse binary!
CREATE OR REPLACE VIEW public.venues_public AS
SELECT 
    id, name, description, address,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.venues;

-- Set up Row Level Security (RLS) - Public Read Only
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access on venues" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Allow public read access on events" ON public.events FOR SELECT USING (true);
