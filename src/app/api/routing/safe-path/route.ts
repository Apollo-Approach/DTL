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

  // Safe Corridor Waypoint:
  // Force the route to snap to the well-lit, heavily surveilled intersection of Dundas St & Richmond St.
  const safeLng = -81.2497;
  const safeLat = 42.9836;

  try {
    // Fetch from OSRM public API (walking route)
    // Format: {start};{waypoint};{end}
    const osrmUrl = `http://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${safeLng},${safeLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    
    const response = await fetch(osrmUrl);
    if (!response.ok) throw new Error('OSRM request failed');
    
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    // OSRM returns geometry directly as GeoJSON LineString when geometries=geojson is used
    const routeFeature = {
      type: "Feature",
      geometry: data.routes[0].geometry
    };

    return NextResponse.json({ route: routeFeature });
  } catch (error) {
    console.error("OSRM Routing Error:", error);
    
    // Fallback to straight lines if OSRM fails
    const routeFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [startLng, startLat], 
          [safeLng, safeLat], 
          [endLng, endLat]
        ]
      }
    };
    return NextResponse.json({ route: routeFeature });
  }
}
