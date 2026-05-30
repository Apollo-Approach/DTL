-- supabase/migrations/20260530010000_harden_security.sql

-- 1. Secure safety_incidents table
ALTER TABLE public.safety_incidents 
ADD COLUMN reporter_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS "Allow public insert on incidents" ON public.safety_incidents;
-- No new INSERT policy is created because inserts must go through the SECURITY DEFINER RPC.

-- 2. Update insert_safety_incident RPC to enforce authentication
CREATE OR REPLACE FUNCTION public.insert_safety_incident(
    p_type text,
    p_description text,
    p_lng double precision,
    p_lat double precision,
    p_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_ip text;
    v_recent_count int;
    v_incident_id uuid;
    v_user_id uuid;
BEGIN
    -- Enforce fully authenticated user (not anonymous)
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean, false) = true THEN
        RAISE EXCEPTION 'You must be logged in to report an incident.';
    END IF;

    -- Extract IP address from headers
    v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    
    IF v_client_ip IS NULL THEN
        v_client_ip := 'unknown';
    END IF;

    -- Rate limiting check: Max 3 incidents per 5 minutes per IP
    SELECT COUNT(*)
    INTO v_recent_count
    FROM public.safety_incidents
    WHERE client_ip = v_client_ip
      AND reported_at > NOW() - INTERVAL '5 minutes';

    IF v_recent_count >= 3 AND v_client_ip != 'unknown' THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please wait before submitting another report.';
    END IF;

    -- Insert the incident
    INSERT INTO public.safety_incidents (
        type,
        description,
        location,
        image_url,
        client_ip,
        reporter_id
    )
    VALUES (
        p_type::incident_type,
        p_description,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_image_url,
        v_client_ip,
        v_user_id
    )
    RETURNING id INTO v_incident_id;

    RETURN v_incident_id;
END;
$$;

-- 3. Revoke anon access from the RPC
REVOKE EXECUTE ON FUNCTION public.insert_safety_incident(text, text, double precision, double precision, text) FROM anon;

-- 4. Secure redemptions table
DROP POLICY IF EXISTS "Public insert redemptions" ON public.redemptions;
CREATE POLICY "Authenticated users can insert redemptions" 
ON public.redemptions FOR INSERT TO authenticated 
WITH CHECK (COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean, false) = false);

-- 5. Secure broll_submissions table
DROP POLICY IF EXISTS "Anyone can upload broll clips" ON public.broll_clips;
CREATE POLICY "Authenticated users can upload broll clips" 
ON public.broll_clips FOR INSERT TO authenticated 
WITH CHECK (COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'is_anonymous')::boolean, false) = false);
