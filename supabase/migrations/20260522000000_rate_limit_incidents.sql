-- 1. Add missing columns to safety_incidents for image support and rate limiting
ALTER TABLE public.safety_incidents ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.safety_incidents ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- 2. Create or replace the RPC for inserting safety incidents with rate-limiting
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
BEGIN
    -- Extract IP address from headers (works in Supabase PostgREST)
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
        client_ip
    )
    VALUES (
        p_type::incident_type,
        p_description,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_image_url,
        v_client_ip
    )
    RETURNING id INTO v_incident_id;

    RETURN v_incident_id;
END;
$$;

-- 3. Grant execute permissions to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.insert_safety_incident(text, text, double precision, double precision, text) TO anon;
GRANT EXECUTE ON FUNCTION public.insert_safety_incident(text, text, double precision, double precision, text) TO authenticated;
