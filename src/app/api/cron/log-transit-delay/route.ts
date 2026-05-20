import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Transit Delay Data Logger — Sprint 2.6
 * 
 * Collects per-stop stochastic delay data from LTC GTFS-RT TripUpdates
 * for Routes 02 and 06 through the Richmond Row nightlife corridor.
 * 
 * This data feeds the XGBoost venue busyness prediction model.
 * Requires 30-60 days of continuous collection before model training.
 * 
 * Designed to run as a Vercel Cron Job every 1 minute.
 * 
 * @see Research/Predictive Venue Busyness Modeling Research.md
 */

// ── Richmond Row Corridor Stop IDs ──
// Route 06 runs directly through Richmond Row (north-south).
// These stops span from Queen's Ave to Oxford St — the core nightlife zone.
// Stop naming: RICH{cross_street}{direction} e.g. RICHQUE1 = Richmond at Queen's (northbound)
const RICHMOND_ROW_STOPS = new Set([
  // Route 06 — Richmond St corridor (primary signal)
  'RICHQUE2', 'RICHQUEE',    // Richmond at Queen's Ave
  'RICHKIN4', 'RICHKIN1',    // Richmond at King St (Joe Kool's, Jim Bob Ray's)
  'RICHHOT3', 'RICHHOT2',    // Richmond at Hotel (Barking Frog area)
  'RICHGREY',                // Richmond at Grey St
  'RICHSIM1',                // Richmond at Simcoe St
  'RICHDUF2',                // Richmond at Dufferin Ave
  'RICHKEN2', 'RICHKEN1',    // Richmond at Kent St
  'RICHCENT', 'RICHCEN2',    // Richmond at Central Ave
  'RICHPALL',                // Richmond at Pall Mall
  'RICHOXF2', 'RICHOXF1',    // Richmond at Oxford St (northern boundary)
  'RICHMILL',                // Richmond at Mill St
  'RICHJAM2', 'RICHJAM1',    // Richmond at James St
  'RICHGRO2', 'RICHGRO1',    // Richmond at Grosvenor St
  'RICHCHE2', 'RICHCHE1',    // Richmond at Cheapside
  'RICHVIC2', 'RICHVIC1',    // Richmond at Victoria Park
  // Route 02 — Dundas St corridor (cross-traffic signal)
  'DUNDMAI1', 'DUNDMAI2',    // Dundas at Masonville (near Richmond intersection)
  'DUNDCOL1', 'DUNDCOL2',    // Dundas at Colborne
  'DUNDWAT1', 'DUNDWAT2',    // Dundas at Waterloo
  'DUNDTHR',                 // Dundas at Three
  'KINGRICH',                // King at Richmond (direct intersection)
  'QUEERIC1',                // Queen at Richmond
]);

// Target routes: 02 (Dundas E-W) and 06 (Richmond N-S)
const TARGET_ROUTES = new Set(['02', '06']);

interface GtfsTripUpdateEntity {
  id?: string;
  trip_update?: {
    trip?: { trip_id?: string; route_id?: string; direction_id?: number };
    stop_time_update?: Array<{
      stop_sequence?: number;
      arrival?: { delay?: number; time?: number; schedule_time?: number } | null;
      departure?: { delay?: number; time?: number } | null;
      stop_id?: string;
    }>;
  };
}

interface DelayRecord {
  route_id: string;
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  delay_seconds: number;
  stochastic_delta: number | null;
  day_of_week: number;
  hour_of_day: number;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  // Auth check — prevents abuse of the cron endpoint
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // ── Fetch TripUpdates feed ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `http://gtfs.ltconline.ca/TripUpdate/TripUpdates.json?t=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'DTL-BusynessLogger/1.0',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        { error: 'LTC TripUpdates feed unreachable', status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json() as { entity?: GtfsTripUpdateEntity[] };
    const entities = data.entity || [];

    // ── Extract delay records for target routes + corridor stops ──
    const now = new Date();
    const dayOfWeek = now.getDay();       // 0=Sun, 6=Sat
    const hourOfDay = now.getHours();     // 0-23

    const records: DelayRecord[] = [];

    for (const entity of entities) {
      const tu = entity.trip_update;
      const tripId = tu?.trip?.trip_id;
      const routeId = tu?.trip?.route_id;

      if (!tripId || !routeId || !TARGET_ROUTES.has(routeId)) continue;
      if (!tu?.stop_time_update?.length) continue;

      // Process each stop_time_update for corridor stops
      const updates = tu.stop_time_update;
      
      for (let i = 0; i < updates.length; i++) {
        const stu = updates[i];
        const stopId = stu.stop_id;
        
        if (!stopId || !RICHMOND_ROW_STOPS.has(stopId)) continue;

        const delay = stu.arrival?.delay ?? stu.departure?.delay;
        if (delay === undefined || delay === null) continue;

        // Calculate stochastic delta: SD(i) - SD(i-1)
        // Positive = bus experiencing friction (crowds, congestion)
        // Negative = bus recovering speed
        let stochasticDelta: number | null = null;
        if (i > 0) {
          const prevDelay = updates[i - 1].arrival?.delay ?? updates[i - 1].departure?.delay;
          if (prevDelay !== undefined && prevDelay !== null) {
            stochasticDelta = delay - prevDelay;
          }
        }

        records.push({
          route_id: routeId,
          trip_id: tripId,
          stop_id: stopId,
          stop_sequence: stu.stop_sequence ?? 0,
          delay_seconds: delay,
          stochastic_delta: stochasticDelta,
          day_of_week: dayOfWeek,
          hour_of_day: hourOfDay,
        });
      }
    }

    // ── Batch insert into Supabase ──
    if (records.length > 0) {
      const { error } = await supabase
        .from('transit_delay_log')
        .insert(records);

      if (error) {
        console.error('[Transit Delay Logger] Insert error:', error);
        return NextResponse.json(
          { error: 'Failed to insert delay records', detail: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      recorded_at: now.toISOString(),
      records_inserted: records.length,
      trips_scanned: entities.filter(e => {
        const rid = e.trip_update?.trip?.route_id;
        return rid && TARGET_ROUTES.has(rid);
      }).length,
      day_of_week: dayOfWeek,
      hour_of_day: hourOfDay,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Transit Delay Logger] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
