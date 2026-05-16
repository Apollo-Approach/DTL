// src/app/api/routing/safe-path/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Default start location: Covent Garden Garage if no user location provided
  const startLng = parseFloat(searchParams.get('startLng') || '-81.2515'); 
  const startLat = parseFloat(searchParams.get('startLat') || '42.9824');
  const endLng = parseFloat(searchParams.get('endLng') || '0');
  const endLat = parseFloat(searchParams.get('endLat') || '0');

  if (!endLng || !endLat) {
    return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
  }

  // MVP "Safe Corridor" Waypoint Logic:
  // Instead of a direct shortest-path line (which might cross dark alleys), we force the route  
  // to snap to the well-lit, heavily surveilled intersection of Dundas St & Richmond St.
  const safeIntersection = [-81.2497, 42.9836]; 

  const route = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [startLng, startLat], 
        safeIntersection, 
        [endLng, endLat]
      ]
    }
  };

  return NextResponse.json({ route });
}
