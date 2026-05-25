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

function calculateCentroid(rings) {
  let x = 0, y = 0, n = 0;
  for (const ring of rings) {
    for (const pt of ring) {
      x += pt[0]; y += pt[1]; n++;
    }
  }
  return { x: x/n, y: y/n };
}

function haversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
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
        // Sort by geographic distance to the polygon centroid to pick the closest building
        data.features.sort((a, b) => {
           let distA = Infinity;
           let distB = Infinity;
           
           if (a.geometry && a.geometry.rings) {
             const cA = calculateCentroid(a.geometry.rings);
             distA = haversineDist(dbCoords.lat, dbCoords.lng, cA.y, cA.x);
           }
           if (b.geometry && b.geometry.rings) {
             const cB = calculateCentroid(b.geometry.rings);
             distB = haversineDist(dbCoords.lat, dbCoords.lng, cB.y, cB.x);
           }
           
           return distA - distB;
        });
        
        // Take the closest intersecting building
        let geom = data.features[0].geometry;
        
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
