// src/app/api/civic/transit/route.ts
import { NextResponse } from 'next/server';

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
    const buses: any[] = [];
    
    const entities = data.entity || data.Entity || data || [];

    entities.forEach((entity: any) => {
      const v = entity.vehicle || entity.Vehicle;
      if (v?.position?.latitude && v?.position?.longitude) {
        const nowSec = Math.floor(Date.now() / 1000);
        const timestamp = v.timestamp || nowSec;
        const isDelayed = (nowSec - timestamp) > 180; // Delayed if ping is older than 3 mins

        buses.push({
          id: v.vehicle?.id || entity.id,
          routeId: v.trip?.routeId || v.trip?.route_id || 'LTC',
          targetLng: v.position.longitude,
          targetLat: v.position.latitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          timestamp: timestamp,
          isDelayed: isDelayed,
          currentStatus: v.current_status,
          stopId: v.stop_id,
          directionId: v.trip?.direction_id,
          occupancyStatus: v.occupancy_status,
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
