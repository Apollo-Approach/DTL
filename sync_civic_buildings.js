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
      // Spatial intersection query
      const geometryParam = encodeURIComponent(`{"x":${dbCoords.lng},"y":${dbCoords.lat},"spatialReference":{"wkid":4326}}`);
      const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=15&units=esriSRUnit_Meter&outFields=*&outSR=4326&f=geojson`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.features && data.features.length > 0) {
        // Take the first intersecting building
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
