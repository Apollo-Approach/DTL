import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

function decodePostGISPoint(hexString) {
  try {
    const buf = Buffer.from(hexString, 'hex');
    const x = buf.readDoubleLE(9);
    const y = buf.readDoubleLE(17);
    return { lat: y, lng: x };
  } catch(e) { return null; }
}

// Ray-casting algorithm for point in polygon
function pointInPolygon(pt, geom) {
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
function distToSegmentMeters(pt, v, w) {
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
function distToPolygonEdgeMeters(pt, geom) {
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

async function syncBuildings() {
  console.log("Fetching venues from database...");
  const { data: venues, error } = await supabase.from('venues').select('id, name, type, late_night_eligible, location');
  
  if (error) return console.error(error);

  console.log(`Querying City of London Open Data Building Outlines API for ${venues.length} venues...`);
  
  const featureCollection = {
    type: "FeatureCollection",
    features: []
  };

  for (const venue of venues) {
    if (!venue.location) continue;
    const dbCoords = decodePostGISPoint(venue.location);
    if (!dbCoords) continue;

    try {
      // Create a small bounding box (~50m) around the coordinate
      const d = 0.0005;
      const geometryParam = encodeURIComponent(`{"xmin":${dbCoords.lng - d},"ymin":${dbCoords.lat - d},"xmax":${dbCoords.lng + d},"ymax":${dbCoords.lat + d},"spatialReference":{"wkid":4326}}`);
      const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.features && data.features.length > 0) {
        // Sort by edge distance instead of centroid distance
        const pt = [dbCoords.lng, dbCoords.lat];
        
        data.features.sort((a, b) => {
           let distA = Infinity;
           let distB = Infinity;
           
           if (a.geometry) {
             if (pointInPolygon(pt, a.geometry)) {
               distA = 0;
             } else {
               distA = distToPolygonEdgeMeters(pt, a.geometry);
             }
           }
           if (b.geometry) {
             if (pointInPolygon(pt, b.geometry)) {
               distB = 0;
             } else {
               distB = distToPolygonEdgeMeters(pt, b.geometry);
             }
           }
           
           // Store the distance in the feature for filtering below
           a.properties._distToPin = distA;
           b.properties._distToPin = distB;
           
           return distA - distB;
        });
        
        const bestFeature = data.features[0];
        // Only accept if the distance is 30 meters or less.
        // This acts as the "street bounding logic" to prevent snapping to a building across the street!
        if (bestFeature.properties._distToPin <= 30) {
          let geom = bestFeature.geometry;

          // Add venue properties to the geojson feature
          const feature = {
            type: 'Feature',
            geometry: geom,
            properties: {
              venue_id: venue.id,
              name: venue.name,
              type: venue.type,
              hasSpecials: !!venue.late_night_eligible,
              height: 10 // Default extrusion height, no HEIGHT property in Layer 3
            }
          };

          featureCollection.features.push(feature);
          process.stdout.write('🏢');
        } else {
          // The closest building is too far away (e.g. across the street)
          process.stdout.write('❌');
        }
      } else {
        process.stdout.write('❌');
      }
    } catch (err) {
      process.stdout.write('E');
    }
    
    // Slight delay to respect municipal servers
    await new Promise(r => setTimeout(r, 200));
  }
  
  const path = 'public/civic_data/civic_venue_buildings.geojson';
  fs.writeFileSync(path, JSON.stringify(featureCollection, null, 2));
  console.log(`\n\nSync Complete! Extracted ${featureCollection.features.length} perfect municipal building footprints.`);
  console.log(`Saved to ${path}`);
}

syncBuildings();
