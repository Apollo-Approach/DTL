import { NextResponse } from 'next/server';
import tripMappingRaw from '@/lib/data/trip_mapping.json';

const tripMapping = tripMappingRaw as Record<string, string>;

interface TransitBus {
  id: string;
  headsign: string | null;
  routeId: string;
  targetLng: number;
  targetLat: number;
  bearing: number;
  speed: number;
  timestamp: number;
  isDelayed: boolean;
  currentStatus: number;
  stopId: string;
  directionId: number;
  occupancyStatus: number;
  occupancyPercentage?: number;
}

interface GtfsEntity {
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
  Vehicle?: GtfsEntity['vehicle'];
}

export const dynamic = 'force-dynamic';
export const revalidate = 0; 

export async function GET() {
  try {
    // Add a cache-busting query parameter because the LTC IIS servers aggressively cache the raw endpoint
    const url = `http://gtfs.ltconline.ca/Vehicle/VehiclePositions.json?t=${Date.now()}`;
    
    // Use AbortController for a strict 5-second timeout instead of gotScraping 
    // to avoid Next.js ESM compilation issues.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error(`LTC Feed Error: ${response.status}`);

    const data = await response.json();
    const buses: TransitBus[] = [];
    
    const entities = data.entity || data.Entity || data || [];

    entities.forEach((entity: GtfsEntity) => {
      const v = entity.vehicle || entity.Vehicle;
      if (v?.position?.latitude && v?.position?.longitude) {
        const nowSec = Math.floor(Date.now() / 1000);
        const timestamp = v.timestamp || nowSec;
        const isDelayed = (nowSec - timestamp) > 180; // Delayed if ping is older than 3 mins

        const tripId = v.trip?.tripId || v.trip?.trip_id;
        const headsign = tripId ? tripMapping[tripId] : null;

        buses.push({
          id: v.vehicle?.id || entity.id || '',
          headsign: headsign,
          routeId: v.trip?.routeId || v.trip?.route_id || 'LTC',
          targetLng: v.position.longitude,
          targetLat: v.position.latitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          timestamp: timestamp,
          isDelayed: isDelayed,
          currentStatus: v.current_status ?? 0,
          stopId: v.stop_id || '',
          directionId: v.trip?.direction_id ?? 0,
          occupancyStatus: v.occupancy_status ?? 0,
          occupancyPercentage: v.occupancy_percentage
        });
      }
    });

    return NextResponse.json({ buses });
    
  } catch (error) {
    const err = error as Error;
    console.error('Transit API Error:', err.message);
    
    // Return 504 Gateway Timeout so the frontend (transitRes.ok = false) ignores the response
    // rather than processing an empty array and deleting all active buses from the map.
    return NextResponse.json({ error: 'LTC feed offline' }, { status: 504 });
  }
}
