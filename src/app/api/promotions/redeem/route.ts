// src/app/api/promotions/redeem/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  // Service Role bypasses RLS so the server can securely mutate the ledger
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! 
  );
  try {
    const { promoId, deviceId } = await request.json();

    if (!promoId || !deviceId) {
      return NextResponse.json({ error: 'Missing QR payload data' }, { status: 400 });
    }

    // 1. Verify Promotion is valid and active
    const { data: promo, error: promoError } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('id', promoId)
      .single();

    if (promoError || !promo) {
      return NextResponse.json({ error: 'Invalid promotion code.' }, { status: 404 });
    }

    if (new Date(promo.active_until) < new Date()) {
      return NextResponse.json({ error: 'Promotion has expired.' }, { status: 403 });
    }

    // 2. Saga Ledger Insertion (Atomic Double-Spend Prevention)
    const { error: redeemError } = await supabaseAdmin
      .from('redemptions')
      .insert({
        promotion_id: promoId,
        user_device_id: deviceId
      });

    if (redeemError) {
      if (redeemError.code === '23505') { // Postgres Unique Violation Error Code
        return NextResponse.json({ error: 'Ticket already redeemed on this device!' }, { status: 409 });
      }
      throw redeemError;
    }

    return NextResponse.json({ success: true, message: `${promo.discount_value} Redeemed!` });

  } catch (error) {
    console.error('Redemption Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
