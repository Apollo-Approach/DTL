import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Promotional Feed API — Sprint 2.4
 *
 * The Fever-inspired "open app, instantly see what's relevant RIGHT NOW" experience.
 *
 * Query flow:
 *   1. Get current day of week + time
 *   2. Query promotions where recurring_day matches today AND active time window
 *   3. Filter by situation_tags matching time-aware relevance
 *   4. Sort by proximity to user (if location provided)
 *   5. Return ranked feed with venue metadata
 *
 * @see Research/Competitive Platform Analysis for DTL.md
 * @see Research/Nightlife Data Pipeline Expansion Research.md
 */

export const dynamic = 'force-dynamic';
export const revalidate = 60; // 1-minute cache for feed freshness

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { searchParams } = new URL(request.url);
    const userLat = parseFloat(searchParams.get('lat') || '42.9849');
    const userLng = parseFloat(searchParams.get('lng') || '-81.2453');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const tagsFilter = searchParams.get('tags')?.split(',').filter(Boolean) || [];

    // ── Temporal context ──
    const now = new Date();
    const currentDay = DAY_NAMES[now.getDay()];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    // ── Query active promotions for today ──
    // Matches: recurring_day = today OR recurring_day IS NULL (every day)
    // AND current time falls within active window
    let query = supabase
      .from('promotions')
      .select(`
        id,
        venue_id,
        title,
        description,
        discount_value,
        active_until,
        recurring_day,
        active_from_time,
        active_until_time,
        situation_tags,
        source_platform,
        source_url
      `)
      .or(`recurring_day.eq.${currentDay},recurring_day.is.null`)
      .gt('active_until', now.toISOString());

    // If specific tags requested, filter using overlap
    if (tagsFilter.length > 0) {
      query = query.overlaps('situation_tags', tagsFilter);
    }

    const { data: promotions, error: promoError } = await query.limit(limit * 2); // Fetch extra for post-filtering

    if (promoError) {
      console.error('[Promo Feed] Query error:', promoError);
      return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 });
    }

    if (!promotions || promotions.length === 0) {
      return NextResponse.json({
        feed: [],
        count: 0,
        context: { day: currentDay, time: currentTime },
        lastUpdated: now.toISOString(),
      });
    }

    // ── Time window filtering ──
    // Only show promotions within their active time window
    const timeFiltered = promotions.filter(promo => {
      if (!promo.active_from_time && !promo.active_until_time) return true;

      const from = promo.active_from_time || '00:00';
      const until = promo.active_until_time || '23:59';

      // Handle overnight windows (e.g., 22:00 to 03:00)
      if (from > until) {
        return currentTime >= from || currentTime <= until;
      }
      return currentTime >= from && currentTime <= until;
    });

    // ── Fetch venue details for matched promotions ──
    const venueIds = [...new Set(timeFiltered.map(p => p.venue_id).filter(Boolean))];
    let venueMap: Record<string, { name: string; lat: number; lng: number; situation_tags?: string[] }> = {};

    if (venueIds.length > 0) {
      const { data: venues } = await supabase
        .from('venues_public')
        .select('id, name, lat, lng, situation_tags')
        .in('id', venueIds);

      if (venues) {
        venueMap = Object.fromEntries(
          venues.map(v => [v.id, { name: v.name, lat: v.lat, lng: v.lng, situation_tags: v.situation_tags }])
        );
      }
    }

    // ── Enrich and rank ──
    const enriched = timeFiltered
      .map(promo => {
        const venue = promo.venue_id ? venueMap[promo.venue_id] : null;

        // Calculate distance from user (Haversine approximation)
        let distanceKm: number | null = null;
        if (venue?.lat && venue?.lng) {
          distanceKm = haversineKm(userLat, userLng, venue.lat, venue.lng);
        }

        return {
          id: promo.id,
          title: promo.title,
          description: promo.description,
          discount_value: promo.discount_value,
          venue_name: venue?.name || 'Unknown Venue',
          venue_id: promo.venue_id,
          situation_tags: promo.situation_tags || [],
          venue_tags: venue?.situation_tags || [],
          recurring_day: promo.recurring_day,
          active_window: promo.active_from_time && promo.active_until_time
            ? `${promo.active_from_time}–${promo.active_until_time}`
            : 'All day',
          distance_km: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
          source_platform: promo.source_platform,
          source_url: promo.source_url,
        };
      })
      // Sort: closer venues first, then by discount value
      .sort((a, b) => {
        if (a.distance_km !== null && b.distance_km !== null) {
          return a.distance_km - b.distance_km;
        }
        if (a.distance_km !== null) return -1;
        if (b.distance_km !== null) return 1;
        return 0;
      })
      .slice(0, limit);

    return NextResponse.json({
      feed: enriched,
      count: enriched.length,
      context: {
        day: currentDay,
        time: currentTime,
        user_location: { lat: userLat, lng: userLng },
        tags_applied: tagsFilter.length > 0 ? tagsFilter : 'all',
      },
      lastUpdated: now.toISOString(),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Promo Feed] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fast Haversine distance calculation (km).
 * Good enough for proximity ranking within a city.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
