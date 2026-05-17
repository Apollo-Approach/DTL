-- supabase/migrations/20260517020000_dynamic_coupons.sql

-- 1. Drop the old anonymous redemptions table
DROP TABLE IF EXISTS public.redemptions CASCADE;

-- 2. Create the User Passes table (The QR Code payload)
CREATE TABLE public.user_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID REFERENCES public.promotions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('ISSUED', 'REDEEMED', 'EXPIRED')) DEFAULT 'ISSUED',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMPTZ,
    UNIQUE(promotion_id, user_id) -- One pass per user per promotion
);

-- 3. Recreate the Redemptions table (The Financial Ledger)
CREATE TABLE public.redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_id UUID REFERENCES public.user_passes(id) ON DELETE CASCADE,
    venue_id TEXT REFERENCES public.venues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_fee DECIMAL(10,2) NOT NULL DEFAULT 1.00, -- Dynamic billing amount
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pass_id) -- A pass can only be redeemed and billed once
);

-- 4. Enable RLS
ALTER TABLE public.user_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Users can read their own passes
CREATE POLICY "Users can view their own passes" 
ON public.user_passes FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own passes (claiming)
CREATE POLICY "Users can insert their own passes" 
ON public.user_passes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Only venue staff/service role can read redemptions (ledger privacy)
-- For now, we allow read if they have a staff role or just restrict it to server actions
CREATE POLICY "Only service role can manage redemptions" 
ON public.redemptions FOR ALL 
USING (false) WITH CHECK (false); 
-- Since we use Supabase service_role in Next.js Server Actions to securely verify 
-- and redeem passes, we don't need to expose INSERT/SELECT to the public anon role.

-- Similarly, only service role can update the pass status to REDEEMED
CREATE POLICY "Only service role can update passes"
ON public.user_passes FOR UPDATE
USING (false) WITH CHECK (false);
