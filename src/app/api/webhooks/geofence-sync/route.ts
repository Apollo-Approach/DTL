import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Geofence Sync Webhook — Sprint 4.2
 *
 * Endpoint that pushes updated venue/deal data via FCM silent push
 * to refresh clients' local SQLite caches.
 *
 * Architecture:
 *   1. Admin/cron triggers this endpoint after deal data changes
 *   2. Endpoint queries current active deals + venue coords
 *   3. Sends FCM data-only message (content-available: 1) to all
 *      registered device tokens
 *   4. Client receives silent push → calls refreshGeofenceData()
 *
 * FCM Economics:
 *   - Firebase Cloud Messaging is permanently free (no message caps)
 *   - Silent pushes on iOS are throttled to ~1 per 21 min by Apple
 *   - Design sync cadence accordingly (we batch on deal changes)
 *
 * Security:
 *   - Protected by CRON_SECRET for automated triggers
 *   - Or by Supabase service role for admin dashboard triggers
 *
 * @see Research/Geofencing Push Notifications with Capacitor.md §4-5
 */

export const dynamic = 'force-dynamic';

/**
 * Generate a short-lived OAuth2 access token from a Google service account key.
 * Used for FCM v1 API authentication.
 */
async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const { SignJWT, importPKCS8 } = await import('jose');

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');

  const jwt = await new SignJWT({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  const tokenRes = await fetch(serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth2 token exchange failed: ${await tokenRes.text()}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

export async function POST(request: Request) {
  // ── Auth: Require CRON_SECRET or valid admin session ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const now = new Date();

    // ── 1. Fetch all venues with coordinates ──
    const { data: venues, error: vErr } = await supabase
      .from('venues')
      .select('id, name, address, location')
      .order('name');

    if (vErr) throw new Error(`Venues query failed: ${vErr.message}`);

    // ── 2. Fetch active promotions ──
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = DAY_NAMES[now.getDay()];

    const { data: promos, error: pErr } = await supabase
      .from('promotions')
      .select('id, venue_id, title, discount_value, recurring_day, active_from_time, active_until_time')
      .gt('active_until', now.toISOString())
      .or(`recurring_day.eq.${currentDay},recurring_day.is.null`);

    if (pErr) throw new Error(`Promotions query failed: ${pErr.message}`);

    // ── 3. Build compact sync payload ──
    // This payload is designed to be small (<4KB) to fit within FCM data limits
    const venueRecords = (venues || []).map(v => ({
      id: v.id,
      name: v.name,
      address: v.address,
      // Extract lat/lng from PostGIS point
      lat: v.location ? parseFloat(v.location.coordinates?.[1] || '0') : 0,
      lng: v.location ? parseFloat(v.location.coordinates?.[0] || '0') : 0,
    }));

    // Build deal map: venue_id → best deal
    const dealMap: Record<string, { headline: string; id: string }> = {};
    for (const p of promos || []) {
      if (p.venue_id && !dealMap[p.venue_id]) {
        dealMap[p.venue_id] = {
          headline: p.discount_value || p.title,
          id: p.id,
        };
      }
    }

    // ── 4. Fetch registered device tokens ──
    const { data: tokens, error: tErr } = await supabase
      .from('device_tokens')
      .select('fcm_token, platform')
      .eq('geofencing_enabled', true);

    if (tErr) {
      console.warn('[GeofenceSync] Device tokens query failed:', tErr.message);
    }

    const deviceTokens = tokens || [];

    // ── 5. Send FCM silent push ──
    let sentCount = 0;
    let failedCount = 0;

    if (deviceTokens.length > 0 && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      // ── FCM v1 API (modern, replaces deprecated legacy API) ──
      // Requires: GOOGLE_SERVICE_ACCOUNT_KEY env var (stringified JSON of service account key)
      const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      const accessToken = await getAccessToken(serviceAccount);

      // Compact payload — FCM data-only message (no notification key)
      const syncPayload = {
        type: 'geofence_sync',
        version: '1',
        timestamp: now.toISOString(),
        venue_count: venueRecords.length.toString(),
        deal_count: Object.keys(dealMap).length.toString(),
        sync_url: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/webhooks/geofence-sync`,
      };

      const projectId = serviceAccount.project_id;

      // Send to each device token individually (FCM v1 doesn't support batch registration_ids)
      for (const token of deviceTokens) {
        try {
          const fcmResponse = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                message: {
                  token: token.fcm_token,
                  data: syncPayload,
                  // iOS: content-available triggers background fetch
                  apns: {
                    payload: {
                      aps: { 'content-available': 1 },
                    },
                  },
                  // Android: normal priority for battery efficiency
                  android: {
                    priority: 'normal',
                    ttl: '21600s', // 6 hours
                  },
                },
              }),
            }
          );

          if (fcmResponse.ok) {
            sentCount++;
          } else {
            failedCount++;
            const errText = await fcmResponse.text();
            console.error(`[GeofenceSync] FCM send failed for token ${token.fcm_token.slice(0, 8)}...:`, errText);
          }
        } catch (fcmErr) {
          failedCount++;
          console.error('[GeofenceSync] FCM send error:', fcmErr);
        }
      }
    }

    const response = {
      success: true,
      sync: {
        venues: venueRecords.length,
        activeDeals: Object.keys(dealMap).length,
        devices: {
          total: deviceTokens.length,
          sent: sentCount,
          failed: failedCount,
        },
      },
      timestamp: now.toISOString(),
    };

    console.log('[GeofenceSync] ✅ Sync complete:', response.sync);
    return NextResponse.json(response);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GeofenceSync] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET — Returns the latest sync payload for clients to pull.
 * Used as a fallback when FCM silent push is throttled by iOS.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const now = new Date();
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = DAY_NAMES[now.getDay()];

    // Fetch venues with lat/lng via the public view
    const { data: venues } = await supabase
      .from('venues_public')
      .select('id, name, address, lat, lng');

    // Fetch active deals
    const { data: promos } = await supabase
      .from('promotions')
      .select('id, venue_id, title, discount_value')
      .gt('active_until', now.toISOString())
      .or(`recurring_day.eq.${currentDay},recurring_day.is.null`);

    // Build compact payload
    const payload = {
      venues: (venues || []).map(v => ({
        id: v.id,
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        deal: null as { headline: string; id: string } | null,
      })),
      timestamp: now.toISOString(),
    };

    // Attach deals to venues
    const dealMap = new Map<string, { headline: string; id: string }>();
    for (const p of promos || []) {
      if (p.venue_id && !dealMap.has(p.venue_id)) {
        dealMap.set(p.venue_id, { headline: p.discount_value || p.title, id: p.id });
      }
    }
    for (const venue of payload.venues) {
      venue.deal = dealMap.get(venue.id) || null;
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
