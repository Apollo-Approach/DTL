-- supabase/migrations/20260530020000_enforce_promo_limits.sql

-- Drop existing if any
DROP FUNCTION IF EXISTS public.claim_promotion(UUID, UUID, TEXT);

-- Create atomic claim promotion function
CREATE OR REPLACE FUNCTION public.claim_promotion(p_promotion_id UUID, p_user_id UUID, p_pass_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_total_allowed INT;
  v_current_claims INT;
  v_pass_id UUID;
  v_active_until TIMESTAMPTZ;
BEGIN
  -- Lock the promotion row for update to prevent race conditions
  SELECT total_claims_allowed, active_until INTO v_total_allowed, v_active_until
  FROM public.promotions
  WHERE id = p_promotion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Promotion not found.');
  END IF;

  IF v_active_until <= NOW() THEN
    RETURN json_build_object('success', false, 'error', 'This promotion has expired.');
  END IF;

  -- Count existing claims
  SELECT COUNT(*) INTO v_current_claims
  FROM public.user_passes
  WHERE promotion_id = p_promotion_id;

  IF v_current_claims >= v_total_allowed THEN
    RETURN json_build_object('success', false, 'error', 'Promotion has reached its claim limit.');
  END IF;

  -- Insert the pass
  INSERT INTO public.user_passes (promotion_id, user_id, status, pass_code)
  VALUES (p_promotion_id, p_user_id, 'ISSUED', p_pass_code)
  RETURNING id INTO v_pass_id;

  RETURN json_build_object('success', true, 'pass_id', v_pass_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'You have already claimed this promotion.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_promotion(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_promotion(UUID, UUID, TEXT) FROM anon;
