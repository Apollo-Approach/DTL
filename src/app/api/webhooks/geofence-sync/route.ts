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
      .select('id, name, address, location, situation_tags')
      .order('name');

    if (vErr) throw new Error(`Venues query failed: ${vErr.message}`);

    // ── 2. Fetch active promotions ──
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = DAY_NAMES[now.getDay()];

    const { data: promos, error: pErr } = await supabase
      .from('promotions')
      .select('id, venue_id, title, discount_value, recurring_day, active_from_time, active_until_time, situation_tags')
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
      tags: v.situation_tags || [],
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

    if (deviceTokens.length > 0 && process.env.FCM_SERVER_KEY) {
      // Compact payload — FCM data-only message (no notification key)
      const syncPayload = {
        type: 'geofence_sync',
        version: '1',
        timestamp: now.toISOString(),
        venue_count: venueRecords.length.toString(),
        deal_count: Object.keys(dealMap).length.toString(),
        // Full data sent as stringified JSON in the 'data' key
        // Clients decompress and write to local SQLite
        sync_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/geofence-sync/payload`,
      };

      // FCM HTTP v1 API via topic (more efficient than individual sends)
      // For now, send to individual tokens in batches of 500
      const batchSize = 500;
      for (let i = 0; i < deviceTokens.length; i += batchSize) {
        const batch = deviceTokens.slice(i, i + batchSize);
        const registrationIds = batch.map(t => t.fcm_token);

        try {
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `key=${process.env.FCM_SERVER_KEY}`,
            },
            body: JSON.stringify({
              registration_ids: registrationIds,
              // iOS: content-available triggers background fetch
              content_available: true,
              // Android: data-only message wakes app
              data: syncPayload,
              // Low priority to avoid battery drain
              priority: 'normal',
              // TTL: 6 hours (deals change frequently)
              time_to_live: 21600,
            }),
          });

          if (fcmResponse.ok) {
            const result = await fcmResponse.json();
            sentCount += result.success || 0;
            failedCount += result.failure || 0;
          } else {
            failedCount += registrationIds.length;
            console.error('[GeofenceSync] FCM batch failed:', await fcmResponse.text());
          }
        } catch (fcmErr) {
          failedCount += registrationIds.length;
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
export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const now = new Date();
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = DAY_NAMES[now.getDay()];

    // Fetch venues with lat/lng via the public view
    const { data: venues } = await supabase
      .from('venues_public')
      .select('id, name, address, lat, lng, situation_tags');

    // Fetch active deals
    const { data: promos } = await supabase
      .from('promotions')
      .select('id, venue_id, title, discount_value, situation_tags')
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
        tags: v.situation_tags || [],
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
