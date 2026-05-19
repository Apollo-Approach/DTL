-- supabase/migrations/20260518010000_venue_roles.sql

-- 1. Add 'venue_manager' to user_role ENUM
-- We need to use a workaround since Postgres doesn't support 'IF NOT EXISTS' for adding enum values easily in a single block without DO blocks, but since this is a new migration, we can just alter it.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'venue_manager';

-- 2. Add venue_id to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS venue_id TEXT REFERENCES public.venues(id) ON DELETE SET NULL;

-- 3. Update Policies for venue managers
-- Venue managers can update their own venue
CREATE POLICY "Venue managers can update their venue" ON public.venues
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'venue_manager' AND venue_id = public.venues.id
        )
    );
