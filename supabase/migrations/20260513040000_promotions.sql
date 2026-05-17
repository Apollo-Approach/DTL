-- supabase/migrations/20260513_04_promotions.sql

-- Create the Active Promotions Table
CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id TEXT REFERENCES public.venues(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    discount_value TEXT NOT NULL,
    active_until TIMESTAMPTZ NOT NULL,
    total_claims_allowed INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the Secure Redemptions Table (Saga Pattern ledger)
CREATE TABLE public.redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID REFERENCES public.promotions(id) ON DELETE CASCADE,
    user_device_id TEXT NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(promotion_id, user_device_id) -- Prevents double spending
);

-- Enable RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read active promotions" ON public.promotions FOR SELECT USING (active_until > NOW());
CREATE POLICY "Public insert redemptions" ON public.redemptions FOR INSERT WITH CHECK (true);
