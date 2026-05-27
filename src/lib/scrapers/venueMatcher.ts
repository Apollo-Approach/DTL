import fs from 'fs';
import path from 'path';

let civicBuildingsCache: any = null;

function loadCivicBuildings() {
  if (civicBuildingsCache) return civicBuildingsCache;
  try {
    const geojsonPath = path.resolve(process.cwd(), 'public/civic_data/civic_venue_buildings.geojson');
    const rawData = fs.readFileSync(geojsonPath, 'utf8');
    civicBuildingsCache = JSON.parse(rawData);
    return civicBuildingsCache;
  } catch (err) {
    console.error('Failed to load civic_venue_buildings.geojson:', err);
    return { features: [] };
  }
}

// Ray-casting algorithm for point in polygon
function pointInPolygon(pt: [number, number], geom: any): boolean {
  let inside = false;
  const x = pt[0], y = pt[1];
  
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  
  for (const coordinates of polys) {
    for (const ring of coordinates) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
    }
  }
  return inside;
}

// Distance from point to line segment in METERS
function distToSegmentMeters(pt: [number, number], v: [number, number], w: [number, number]): number {
  // London, ON scale factors
  const kx = 81400;  // meters per degree lon at lat 43
  const ky = 111320; // meters per degree lat

  const px = pt[0]*kx, py = pt[1]*ky;
  const vx = v[0]*kx, vy = v[1]*ky;
  const wx = w[0]*kx, wy = w[1]*ky;

  const l2 = (vx - wx)**2 + (vy - wy)**2;
  if (l2 === 0) return Math.sqrt((px - vx)**2 + (py - vy)**2);
  let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (vx + t * (wx - vx)))**2 + (py - (vy + t * (wy - vy)))**2);
}

// Distance to the closest edge of the polygon in METERS
function distToPolygonEdgeMeters(pt: [number, number], geom: any): number {
  let minDist = Infinity;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];

  for (const coordinates of polys) {
    for (const ring of coordinates) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = distToSegmentMeters(pt, ring[i], ring[i+1]);
        if (d < minDist) minDist = d;
      }
    }
  }
  return minDist;
}

/**
 * Matches raw event coordinates to the exact municipal building polygon of a venue.
 * Ensures the event snaps to the exact building, handling drift without jumping the street.
 * @returns The venue_id if matched, or null if no venue exists within 30m of the coordinate.
 */
export function matchEventToVenue(lat: number, lng: number): string | null {
  const geojson = loadCivicBuildings();
  const pt: [number, number] = [lng, lat];
  
  let bestVenueId: string | null = null;
  let minDistance = Infinity;

  for (const feature of geojson.features) {
    let dist = Infinity;
    
    if (pointInPolygon(pt, feature.geometry)) {
      dist = 0;
    } else {
      dist = distToPolygonEdgeMeters(pt, feature.geometry);
    }

    if (dist < minDistance) {
      minDistance = dist;
      bestVenueId = feature.properties.venue_id;
    }
  }

  // Strict 30-meter cutoff to prevent snapping to venues across the street
  if (minDistance <= 30 && bestVenueId) {
    return bestVenueId;
  }

  return null;
}
