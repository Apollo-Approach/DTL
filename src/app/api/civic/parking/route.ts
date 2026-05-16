// src/app/api/civic/parking/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'public', 'civic_data', 'downtown_parking.geojson');
    
    if (!fs.existsSync(dataPath)) {
        return NextResponse.json({ type: 'FeatureCollection', features: [] });
    }
    
    const fileContents = fs.readFileSync(dataPath, 'utf8');
    const geojson = JSON.parse(fileContents);
    
    // Pass through real data only — no simulated telemetry.
    // Estimated capacity is derived from polygon area (approx 1 spot per 25m²).
    const features = geojson.features.map((feature: any) => {
      const areaM2 = feature.properties.area_m2 || 0;
      const estimatedSpots = areaM2 > 0 ? Math.round(areaM2 / 25) : null;
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          estimatedSpots,
          honkZoneId: feature.properties.HonkZoneID || null
        }
      };
    });

    return NextResponse.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error loading parking data:', error);
    return NextResponse.json({ type: 'FeatureCollection', features: [] });
  }
}

