-- supabase/migrations/20260518030000_safety_mods_schema.sql

-- 1. Update Profiles Table (Verification & Accountability)
ALTER TABLE public.profiles
ADD COLUMN identity_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN false_alarms INTEGER NOT NULL DEFAULT 0,
ADD COLUMN phone_number TEXT;

-- 2. Update Safety Incidents Table (Resolution Reporting)
ALTER TABLE public.safety_incidents
ADD COLUMN resolution_code public.resolution_code,
ADD COLUMN resolution_notes TEXT,
ADD COLUMN resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. RLS Policy Updates for M-Tiers
-- M3 Admins can read all incidents and view sensitive info
CREATE POLICY "M3 Admins can manage all incidents" 
ON public.safety_incidents FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'm3_admin'
    )
);

-- M2 Responders can update (resolve) incidents
CREATE POLICY "M2 Responders can resolve incidents"
ON public.safety_incidents FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'm2_responder'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'm2_responder'
    )
);
-- M2 Responders can read all incidents
CREATE POLICY "M2 Responders can read all incidents" ON public.safety_incidents FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'm2_responder'));
