-- Add admin_verified to events to allow M5 admins to verify events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS admin_verified BOOLEAN DEFAULT false;
