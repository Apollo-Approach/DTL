import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

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

// Removed GtfsTripUpdateEntity interface since we use GtfsRealtimeBindings

interface DelayRecord {
  route_id: string;
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  delay_seconds: number;
  stochastic_delta: number | null;
  day_of_week: number;
  hour_of_day: number;
  occupancy_status: number | null;
  occupancy_percentage: number | null;
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
    // ── Fetch TripUpdates and VehiclePositions PB feeds ──
    const fetchBuffer = async (url: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DTL-BusynessLogger/1.0', 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    };

    const [tuBuffer, vpBuffer] = await Promise.all([
      fetchBuffer(`http://gtfs.ltconline.ca/TripUpdate/TripUpdates.pb?t=${Date.now()}`),
      fetchBuffer(`http://gtfs.ltconline.ca/Vehicle/VehiclePositions.pb?t=${Date.now()}`)
    ]);

    const tripUpdateData = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(tuBuffer);
    const vehicleData = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(vpBuffer);

    const tuEntities = tripUpdateData.entity || [];
    const vpEntities = vehicleData.entity || [];

    // ── Build Occupancy Map ──
    const occupancyMap = new Map<string, { status: number | null, percentage: number | null }>();
    for (const entity of vpEntities) {
      const v = entity.vehicle;
      const tripId = v?.trip?.tripId;
      if (tripId) {
        const hasStatus = v.hasOwnProperty('occupancyStatus');
        const hasPct = v.hasOwnProperty('occupancyPercentage');
        occupancyMap.set(tripId, {
          status: hasStatus ? (v.occupancyStatus as number) : null,
          percentage: hasPct ? (v.occupancyPercentage as number) : null
        });
      }
    }

    // ── Extract delay records for target routes + corridor stops ──
    const now = new Date();
    const dayOfWeek = now.getDay();       // 0=Sun, 6=Sat
    const hourOfDay = now.getHours();     // 0-23

    const records: DelayRecord[] = [];

    for (const entity of tuEntities) {
      const tu = entity.tripUpdate;
      const tripId = tu?.trip?.tripId;
      const routeId = tu?.trip?.routeId;

      if (!tripId || !routeId || !TARGET_ROUTES.has(routeId)) continue;
      if (!tu?.stopTimeUpdate?.length) continue;

      // Grab occupancy
      const occ = occupancyMap.get(tripId);

      // Process each stopTimeUpdate for corridor stops
      const updates = tu.stopTimeUpdate;
      
      for (let i = 0; i < updates.length; i++) {
        const stu = updates[i];
        const stopId = stu.stopId;
        
        if (!stopId || !RICHMOND_ROW_STOPS.has(stopId)) continue;

        const delay = stu.arrival?.delay ?? stu.departure?.delay;
        if (delay === undefined || delay === null) continue;

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
          stop_sequence: stu.stopSequence ?? 0,
          delay_seconds: delay,
          stochastic_delta: stochasticDelta,
          day_of_week: dayOfWeek,
          hour_of_day: hourOfDay,
          occupancy_status: occ?.status ?? null,
          occupancy_percentage: occ?.percentage ?? null
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
      trips_scanned: tuEntities.filter(e => {
        const rid = e.tripUpdate?.trip?.routeId;
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
