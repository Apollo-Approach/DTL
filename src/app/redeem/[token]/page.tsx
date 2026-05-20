// src/app/redeem/[token]/page.tsx
// Coupon Redemption Page — Sprint 5
//
// Shows the patron their validated offer after a successful NFC tap.
// Displays: venue name, promotion details, countdown timer, and a
// staff-scannable QR code for point-of-sale verification.

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import RedemptionClient from './RedemptionClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Redeem Your Offer — DTL Nightly',
  description: 'Show this page to your server to claim your exclusive deal.',
  robots: 'noindex, nofollow',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function RedeemPage({ params }: Props) {
  const { token } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up the coupon token in the tap log
  const { data: tap, error: tapError } = await supabase
    .from('nfc_tap_log')
    .select(`
      id,
      tag_id,
      coupon_token,
      coupon_expires_at,
      redeemed_at,
      created_at
    `)
    .eq('coupon_token', token)
    .eq('verified', true)
    .eq('replay_attempt', false)
    .single();

  if (tapError || !tap) {
    notFound();
  }

  // Get tag → promotion + venue details
  const { data: tag } = await supabase
    .from('nfc_tags')
    .select('venue_id, promotion_id, location_label')
    .eq('id', tap.tag_id)
    .single();

  if (!tag) {
    notFound();
  }

  // Get venue details
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, address')
    .eq('id', tag.venue_id)
    .single();

  // Get promotion details
  let promotion = null;
  if (tag.promotion_id) {
    const { data: promo } = await supabase
      .from('promotions')
      .select('id, title, description, discount_value, image_url')
      .eq('id', tag.promotion_id)
      .single();
    promotion = promo;
  }

  return (
    <RedemptionClient
      token={token}
      tap={{
        id: tap.id,
        expiresAt: tap.coupon_expires_at,
        redeemedAt: tap.redeemed_at,
        createdAt: tap.created_at,
      }}
      venue={venue ? { name: venue.name, address: venue.address } : null}
      promotion={promotion ? {
        title: promotion.title,
        description: promotion.description,
        discountValue: promotion.discount_value,
        imageUrl: promotion.image_url,
      } : null}
      locationLabel={tag.location_label}
    />
  );
}
