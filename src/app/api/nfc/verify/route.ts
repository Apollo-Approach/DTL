// src/app/api/nfc/verify/route.ts
// NFC Verification Endpoint — Sprint 5
//
// Receives dynamic SDM URLs from NTAG 424 DNA tags:
//   GET /api/nfc/verify?t=TAG_SHORT_ID&e=PICC_DATA&c=CMAC
//
// On valid tap → redirects to /redeem/<coupon_token>
// On error    → redirects to /redeem/error?reason=<code>

import { NextResponse } from 'next/server';
import { verifyNfcTap } from '@/lib/nfc/sdmVerifier';

export const dynamic = 'force-dynamic';

/** Prefer stable production URL over deployment-specific preview URL. */
function getBaseUrl(): string {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const deployUrl = process.env.VERCEL_URL;
  if (productionUrl) return `https://${productionUrl}`;
  if (deployUrl) return `https://${deployUrl}`;
  return 'http://localhost:3000';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Extract SDM parameters from the dynamic URL
  // t = tag short ID (for efficient lookup — avoids scanning all keys)
  // e = encrypted PICCData (hex)
  // c = CMAC signature (hex)
  const tagShortId = searchParams.get('t');
  const encPiccData = searchParams.get('e') ?? searchParams.get('picc_data');
  const cmac = searchParams.get('c') ?? searchParams.get('cmac');

  // Capture client metadata for audit logging
  const userAgent = request.headers.get('user-agent');
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  const result = await verifyNfcTap(tagShortId, encPiccData, cmac, userAgent, ipAddress);

  const baseUrl = getBaseUrl();

  if (result.success && result.couponToken) {
    // 302 redirect to the redemption page
    return NextResponse.redirect(`${baseUrl}/redeem/${result.couponToken}`, {
      status: 302,
    });
  }

  // Error redirect with reason code
  return NextResponse.redirect(
    `${baseUrl}/redeem/error?reason=${result.error ?? 'internal_error'}`,
    { status: 302 }
  );
}
