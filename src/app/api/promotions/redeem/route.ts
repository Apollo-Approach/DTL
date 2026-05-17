// src/app/api/promotions/redeem/route.ts
// DEPRECATED: This route is replaced by the server action in actions/coupons.ts
// which has proper auth + RBAC via is_venue_staff() + atomic redeem_pass() RPC.
// Keeping file to prevent Next.js 404 on existing bookmarks — returns 410 Gone.

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use the venue scanner interface.' },
    { status: 410 }
  );
}
