import { NextResponse } from 'next/server';
import tripMappingRaw from '@/lib/data/trip_mapping.json';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

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

// Removed inline interfaces since we are using GtfsRealtimeBindings

/** Delay info extracted from TripUpdates feed, keyed by trip_id */
interface TripDelay {
  delaySeconds: number;
  nextStopId: string | null;
}


export const revalidate = 15; 

/**
 * Fetches a single GTFS-RT feed as an ArrayBuffer with a 5-second timeout.
 * Returns null if the request fails (non-critical for enrichment feeds).
 */
async function fetchGtfsFeedBuffer(url: string): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const cacheBuster = Date.now();

    // ── Fetch VehiclePositions + TripUpdates in parallel ──
    // TripUpdates is non-critical: if it fails, we fall back to the old ping-age heuristic.
    const [vehicleBuffer, tripUpdateBuffer] = await Promise.all([
      fetchGtfsFeedBuffer(`http://gtfs.ltconline.ca/Vehicle/VehiclePositions.pb?t=${cacheBuster}`),
      fetchGtfsFeedBuffer(`http://gtfs.ltconline.ca/TripUpdate/TripUpdates.pb?t=${cacheBuster}`)
    ]);
    
    if (!vehicleBuffer) throw new Error('LTC VehiclePositions feed unreachable');
    
    const vehicleData = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(vehicleBuffer);
    const tripUpdateData = tripUpdateBuffer ? GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(tripUpdateBuffer) : null;

    // ── Build delay lookup from TripUpdates ──
    // Key: tripId → { delaySeconds, nextStopId }
    const delayMap = new Map<string, TripDelay>();
    if (tripUpdateData) {
      const tuEntities = tripUpdateData.entity || [];
      for (const entity of tuEntities) {
        const tu = entity.tripUpdate;
        const tripId = tu?.trip?.tripId;
        if (!tripId || !tu?.stopTimeUpdate?.length) continue;

        // Use the first stopTimeUpdate (the current/next stop) for the most relevant delay
        const firstStu = tu.stopTimeUpdate[0];
        const arrDelay = firstStu.arrival?.delay;
        const depDelay = firstStu.departure?.delay;
        const delay = arrDelay ?? depDelay;

        if (delay !== undefined && delay !== null) {
          delayMap.set(tripId, {
            delaySeconds: delay,
            nextStopId: firstStu.stopId || null
          });
        }
      }
    }
    
    const buses: TransitBus[] = [];
    const entities = vehicleData.entity || [];

    entities.forEach((entity: any) => {
      const v = entity.vehicle;
      if (v?.position?.latitude && v?.position?.longitude) {
        const nowSec = Math.floor(Date.now() / 1000);
        // protobufjs Long object has low, high properties.
        const timestampLow = v.timestamp?.low || v.timestamp;
        const timestamp = typeof timestampLow === 'number' ? timestampLow : nowSec;
        const tripId = v.trip?.tripId || null;
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
          routeId: v.trip?.routeId || 'LTC',
          tripId: tripId,
          targetLng: v.position.longitude,
          targetLat: v.position.latitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          timestamp: timestamp,
          isDelayed: isDelayed,
          delaySeconds: delaySeconds,
          delayLabel: delayLabel,
          currentStatus: v.currentStatus ?? 0,
          stopId: v.stopId || '',
          directionId: v.trip?.directionId ?? 0,
          // ── Occupancy: Smart resolution ──
          // If LTC provides occupancyPercentage, trust it as primary source.
          // Only fall back to occupancyStatus enum if percentage is absent.
          // Mark hasOccupancyData = false when BOTH are missing to distinguish
          // "no data" from "genuinely empty bus".
          ...(() => {
            const rawStatus = v.occupancyStatus;
            const rawPct = v.occupancyPercentage;
            // The magical hasOwnProperty check that fixes the "Empty Bus" bug:
            const hasStatus = v.hasOwnProperty('occupancyStatus');
            const hasPct = v.hasOwnProperty('occupancyPercentage');
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
