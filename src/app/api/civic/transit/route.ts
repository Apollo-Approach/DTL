import { NextResponse } from 'next/server';
import tripMappingRaw from '@/lib/data/trip_mapping.json';

const tripMapping = tripMappingRaw as Record<string, string>;

interface TransitBus {
  id: string;
  headsign: string | null;
  routeId: string;
  tripId: string | null;
  targetLng: number;
  targetLat: number;
  bearing: number;
  speed: number;
  timestamp: number;
  isDelayed: boolean;
  delaySeconds: number | null;
  delayLabel: string | null;
  currentStatus: number;
  stopId: string;
  directionId: number;
  occupancyStatus: number;
  occupancyPercentage: number | null;
  hasOccupancyData: boolean;
}

/**
 * Derives occupancy status enum from a percentage value.
 * Mirrors GTFS-RT OccupancyStatus mapping:
 *   0% → EMPTY, 1-25% → MANY_SEATS, 26-50% → FEW_SEATS,
 *   51-75% → STANDING_ROOM, 76-100% → CRUSHED, >100% → FULL
 */
function deriveStatusFromPercentage(pct: number): number {
  if (pct <= 0) return 0;   // EMPTY
  if (pct <= 25) return 1;  // MANY_SEATS_AVAILABLE
  if (pct <= 50) return 2;  // FEW_SEATS_AVAILABLE
  if (pct <= 75) return 3;  // STANDING_ROOM_ONLY
  if (pct <= 100) return 4; // CRUSHED_STANDING_ROOM
  return 5;                 // FULL
}

/**
 * Formats delay seconds into a human-readable label.
 * Negative = early, 0 = on time, positive = late.
 */
function formatDelayLabel(delaySec: number): string {
  const absSec = Math.abs(delaySec);
  if (absSec <= 60) return 'On time';
  const mins = Math.round(absSec / 60);
  if (delaySec < 0) return `${mins} min early`;
  return `${mins} min late`;
}

interface GtfsVehicleEntity {
  id?: string;
  vehicle?: {
    vehicle?: { id?: string };
    trip?: { tripId?: string; trip_id?: string; routeId?: string; route_id?: string; direction_id?: number };
    position?: { latitude?: number; longitude?: number; bearing?: number; speed?: number };
    timestamp?: number;
    current_status?: number;
    stop_id?: string;
    occupancy_status?: number;
    occupancy_percentage?: number;
  };
  Vehicle?: GtfsVehicleEntity['vehicle'];
}

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

/** Delay info extracted from TripUpdates feed, keyed by trip_id */
interface TripDelay {
  delaySeconds: number;
  nextStopId: string | null;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0; 

/**
 * Fetches a single GTFS-RT JSON feed with a 5-second timeout.
 * Returns null if the request fails (non-critical for enrichment feeds).
 */
async function fetchGtfsFeed<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cacheBuster = Date.now();

    // ── Fetch VehiclePositions + TripUpdates in parallel ──
    // TripUpdates is non-critical: if it fails, we fall back to the old ping-age heuristic.
    const [vehicleData, tripUpdateData] = await Promise.all([
      fetchGtfsFeed<{ entity?: GtfsVehicleEntity[]; Entity?: GtfsVehicleEntity[] }>(
        `http://gtfs.ltconline.ca/Vehicle/VehiclePositions.json?t=${cacheBuster}`
      ),
      fetchGtfsFeed<{ entity?: GtfsTripUpdateEntity[] }>(
        `http://gtfs.ltconline.ca/TripUpdate/TripUpdates.json?t=${cacheBuster}`
      )
    ]);
    
    if (!vehicleData) throw new Error('LTC VehiclePositions feed unreachable');

    // ── Build delay lookup from TripUpdates ──
    // Key: trip_id → { delaySeconds, nextStopId }
    const delayMap = new Map<string, TripDelay>();
    if (tripUpdateData) {
      const tuEntities = tripUpdateData.entity || [];
      for (const entity of tuEntities) {
        const tu = entity.trip_update;
        const tripId = tu?.trip?.trip_id;
        if (!tripId || !tu?.stop_time_update?.length) continue;

        // Use the first stop_time_update (the current/next stop) for the most relevant delay
        const firstStu = tu.stop_time_update[0];
        const arrDelay = firstStu.arrival?.delay;
        const depDelay = firstStu.departure?.delay;
        const delay = arrDelay ?? depDelay;

        if (delay !== undefined && delay !== null) {
          delayMap.set(tripId, {
            delaySeconds: delay,
            nextStopId: firstStu.stop_id || null
          });
        }
      }
    }
    
    const buses: TransitBus[] = [];
    const entities = vehicleData.entity || vehicleData.Entity || [];

    entities.forEach((entity: GtfsVehicleEntity) => {
      const v = entity.vehicle || entity.Vehicle;
      if (v?.position?.latitude && v?.position?.longitude) {
        const nowSec = Math.floor(Date.now() / 1000);
        const timestamp = v.timestamp || nowSec;
        const tripId = v.trip?.tripId || v.trip?.trip_id || null;
        const headsign = tripId ? tripMapping[tripId] : null;

        // ── Delay: prefer TripUpdates exact data, fall back to ping-age heuristic ──
        const tripDelay = tripId ? delayMap.get(tripId) : undefined;
        let isDelayed: boolean;
        let delaySeconds: number | null = null;
        let delayLabel: string | null = null;

        if (tripDelay) {
          // Real GTFS-RT delay data available
          delaySeconds = tripDelay.delaySeconds;
          isDelayed = delaySeconds > 120; // >2 min late = delayed
          delayLabel = formatDelayLabel(delaySeconds);
        } else {
          // Fallback: old heuristic (ping older than 3 mins)
          isDelayed = (nowSec - timestamp) > 180;
        }

        buses.push({
          id: v.vehicle?.id || entity.id || '',
          headsign: headsign,
          routeId: v.trip?.routeId || v.trip?.route_id || 'LTC',
          tripId: tripId,
          targetLng: v.position.longitude,
          targetLat: v.position.latitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          timestamp: timestamp,
          isDelayed: isDelayed,
          delaySeconds: delaySeconds,
          delayLabel: delayLabel,
          currentStatus: v.current_status ?? 0,
          stopId: v.stop_id || '',
          directionId: v.trip?.direction_id ?? 0,
          // ── Occupancy: Smart resolution ──
          // If LTC provides occupancy_percentage, trust it as primary source.
          // Only fall back to occupancy_status enum if percentage is absent.
          // Mark hasOccupancyData = false when BOTH are missing to distinguish
          // "no data" from "genuinely empty bus".
          ...(() => {
            const rawStatus = v.occupancy_status;
            const rawPct = v.occupancy_percentage;
            const hasStatus = rawStatus !== undefined && rawStatus !== null;
            const hasPct = rawPct !== undefined && rawPct !== null;
            const hasData = hasStatus || hasPct;

            let finalStatus = 0;
            let finalPct: number | null = null;

            if (hasPct) {
              finalPct = rawPct!;
              // If status is 0 (default/EMPTY) but percentage says otherwise, derive from pct
              finalStatus = (hasStatus && rawStatus! > 0) ? rawStatus! : deriveStatusFromPercentage(rawPct!);
            } else if (hasStatus) {
              finalStatus = rawStatus!;
            }

            return {
              occupancyStatus: finalStatus,
              occupancyPercentage: finalPct,
              hasOccupancyData: hasData
            };
          })()
        });
      }
    });

    return NextResponse.json({ 
      buses,
      meta: {
        tripUpdatesAvailable: delayMap.size > 0,
        tripsWithDelay: delayMap.size,
        totalBuses: buses.length
      }
    });
    
  } catch (error) {
    const err = error as Error;
    console.error('Transit API Error:', err.message);
    
    // Return 504 Gateway Timeout so the frontend (transitRes.ok = false) ignores the response
    // rather than processing an empty array and deleting all active buses from the map.
    return NextResponse.json({ error: 'LTC feed offline' }, { status: 504 });
  }
}
