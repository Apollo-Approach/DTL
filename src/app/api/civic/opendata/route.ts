import { NextResponse } from 'next/server';

/**
 * London Open Data Civic Overlays — Sprint 2.3
 *
 * Fetches live GeoJSON data from the City of London's ArcGIS Open Data Hub
 * for map overlays: parking meters, on-street parking, off-street parking,
 * and bike routes.
 *
 * Data source: https://opendata.london.ca
 * Cost: $0 — public municipal data, no API key required
 *
 * Usage: GET /api/civic/opendata?layer=parking-meters
 *        GET /api/civic/opendata?layer=on-street-parking
 *        GET /api/civic/opendata?layer=off-street-parking
 *        GET /api/civic/opendata?layer=bike-routes
 *        GET /api/civic/opendata?layer=traffic-volumes
 *
 * Optional bbox filter: &bbox=-81.27,42.97,-81.23,42.99
 *
 * @see Research/London Open Data Portal Research.md
 */

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5-minute cache — civic data doesn't change rapidly

// ── London Open Data GeoJSON endpoints ──
const LAYERS: Record<string, { url: string; description: string }> = {
  'on-street-parking': {
    url: 'https://opendata.london.ca/api/download/v1/items/33f0604c4a0e4a1dbb4e840a655ad2a4/geojson?layers=3',
    description: 'On-street parking zones and restrictions',
  },
  'off-street-parking': {
    url: 'https://opendata.london.ca/api/download/v1/items/6c535dccf02141ae9bb9a3774b049143/geojson?layers=2',
    description: 'Municipal parking lots and garages',
  },
  'bike-routes': {
    url: 'https://opendata.london.ca/api/download/v1/items/b9ccfd746f2640b78cc18d2b78ef586a/geojson?layers=20',
    description: 'On-street bicycle routes and cycling infrastructure',
  },
  'traffic-volumes': {
    url: 'https://opendata.london.ca/api/download/v1/items/6e425a70e4e24d2ab47e099c4720a80c/geojson?layers=21',
    description: 'Intersection traffic volume counts',
  },
};

// Downtown London bounding box for spatial filtering
const DOWNTOWN_BBOX = {
  minLng: -81.275,
  minLat: 42.970,
  maxLng: -81.225,
  maxLat: 42.995,
};

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, unknown>;
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

/**
 * Checks if a point is within the given bounding box.
 */
function pointInBbox(
  coords: number[],
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }
): boolean {
  const [lng, lat] = coords;
  return lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

/**
 * Spatial filter: keeps only features that intersect the bounding box.
 * For Points, checks if the point is inside. For Lines/Polygons, checks
 * if any coordinate is inside (conservative approximation).
 */
function filterByBbox(features: GeoJSONFeature[], bbox: typeof DOWNTOWN_BBOX): GeoJSONFeature[] {
  return features.filter(f => {
    if (!f.geometry?.coordinates) return false;

    const type = f.geometry.type;

    if (type === 'Point') {
      return pointInBbox(f.geometry.coordinates as number[], bbox);
    }

    if (type === 'MultiPoint' || type === 'LineString') {
      const coords = f.geometry.coordinates as number[][];
      return coords.some(c => pointInBbox(c, bbox));
    }

    if (type === 'MultiLineString' || type === 'Polygon') {
      const rings = f.geometry.coordinates as number[][][];
      return rings.some(ring => ring.some(c => pointInBbox(c, bbox)));
    }

    if (type === 'MultiPolygon') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const polys = f.geometry.coordinates as any as number[][][][];
      return polys.some((poly: number[][][]) => poly.some((ring: number[][]) => ring.some((c: number[]) => pointInBbox(c, bbox))));
    }

    return true; // Unknown geometry type — keep it
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layerName = searchParams.get('layer');
  const bboxParam = searchParams.get('bbox'); // format: minLng,minLat,maxLng,maxLat

  // List available layers if none specified
  if (!layerName) {
    return NextResponse.json({
      available_layers: Object.entries(LAYERS).map(([key, val]) => ({
        name: key,
        description: val.description,
        usage: `/api/civic/opendata?layer=${key}`,
      })),
      downtown_bbox: DOWNTOWN_BBOX,
    });
  }

  const layer = LAYERS[layerName];
  if (!layer) {
    return NextResponse.json(
      { error: `Unknown layer: ${layerName}`, available: Object.keys(LAYERS) },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(layer.url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'DTL-CivicOverlay/1.0' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Open Data API ${res.status} for layer ${layerName}`);
    }

    const geojson: GeoJSONCollection = await res.json();
    const totalFeatures = geojson.features?.length || 0;

    // Parse bbox or use downtown default
    let bbox = DOWNTOWN_BBOX;
    if (bboxParam) {
      const parts = bboxParam.split(',').map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        bbox = { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
      }
    }

    // Spatial filter to downtown area
    const filtered = filterByBbox(geojson.features || [], bbox);

    return NextResponse.json({
      type: 'FeatureCollection',
      features: filtered,
      metadata: {
        layer: layerName,
        description: layer.description,
        total_features: totalFeatures,
        filtered_features: filtered.length,
        bbox,
        source: 'opendata.london.ca',
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[Open Data] Error fetching ${layerName}:`, err.message);
    return NextResponse.json(
      {
        type: 'FeatureCollection',
        features: [],
        error: `Failed to fetch ${layerName} layer`,
        source: 'opendata.london.ca',
      },
      { status: 503 }
    );
  }
}
