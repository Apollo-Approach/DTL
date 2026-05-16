-- supabase/migrations/20260513_02_civic_features.sql

-- 1. Expand Venue Types for Vacant Storefront Activation
CREATE TYPE venue_status AS ENUM (
    'PERMANENT', 'POP_UP', 'VACANT'
);

-- Add the column to venues
ALTER TABLE public.venues 
ADD COLUMN status venue_status NOT NULL DEFAULT 'PERMANENT';

-- Recreate the View to include the new status column
DROP VIEW IF EXISTS public.venues_public;
CREATE OR REPLACE VIEW public.venues_public AS
SELECT 
    id, name, description, address, status,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.venues;

-- 2. Create Enums for the Safety Mediation System
CREATE TYPE incident_type AS ENUM (
    'WELLNESS_CHECK', 'DE_ESCALATION', 'MEDICAL_MINOR', 'GENERAL_ASSIST'
);

CREATE TYPE incident_status AS ENUM (
    'REPORTED', 'DISPATCHED', 'RESOLVED'
);

-- 3. Create the Safety Incidents Table
CREATE TABLE public.safety_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type incident_type NOT NULL,
    status incident_status NOT NULL DEFAULT 'REPORTED',
    description TEXT,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    -- PostGIS geography for precise map dropping
    location GEOGRAPHY(POINT, 4326) NOT NULL 
);

-- Spatial Index for fast map queries of incidents
CREATE INDEX safety_incidents_location_idx ON public.safety_incidents USING GIST (location);

-- 4. Create an API-friendly View for Next.js Map Rendering
CREATE OR REPLACE VIEW public.safety_incidents_public AS
SELECT 
    id, type, status, description, reported_at, resolved_at,
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng
FROM public.safety_incidents;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for the map to see active pins)
CREATE POLICY "Allow public read access on active incidents" ON public.safety_incidents FOR SELECT USING (status != 'RESOLVED');
-- Allow public insert (for users dropping pins anonymously for the MVP)
CREATE POLICY "Allow public insert on incidents" ON public.safety_incidents FOR INSERT WITH CHECK (true);

-- 6. ENABLE SUPABASE REALTIME
-- This is critical: it tells Postgres to broadcast changes on this table via WebSockets to our Next.js frontend
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_incidents;
