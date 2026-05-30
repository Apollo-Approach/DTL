require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const turf = require('@turf/turf');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decodePostGISPoint(hexString) {
  try {
    const buf = Buffer.from(hexString, 'hex');
    const x = buf.readDoubleLE(9);
    const y = buf.readDoubleLE(17);
    return { lat: y, lng: x };
  } catch(e) { return null; }
}

async function run() {
  console.log("Fetching building polygons from London MapServer...");
  const { data: venues } = await supabase.from('venues').select('id, name, type, late_night_eligible, location');
  
  const featureCollection = { type: "FeatureCollection", features: [] };
  let matchCount = 0;

  for (const venue of venues) {
    if (!venue.location) continue;
    const coords = decodePostGISPoint(venue.location);
    if (!coords) continue;
    
    // Create bounding box around venue (~100m)
    const d = 0.001; 
    const xmin = coords.lng - d;
    const ymin = coords.lat - d;
    const xmax = coords.lng + d;
    const ymax = coords.lat + d;
    const envelope = `${xmin},${ymin},${xmax},${ymax}`;

    const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${envelope}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      
      let closest = null;
      let minD = Infinity;
      const pt = turf.point([coords.lng, coords.lat]);

      if (data.features && data.features.length > 0) {
        for (const b of data.features) {
          if (!b.geometry) continue;
          
          try {
            if (turf.booleanPointInPolygon(pt, b)) {
              minD = 0;
              closest = b;
              break;
            }
          } catch(e) {}

          try {
            let lines = turf.polygonToLine(b);
            if (lines.type === 'FeatureCollection') {
              for (let f of lines.features) {
                let dist = turf.pointToLineDistance(pt, f, {units: 'meters'});
                if (dist < minD) { minD = dist; closest = b; }
              }
            } else {
              let dist = turf.pointToLineDistance(pt, lines, {units: 'meters'});
              if (dist < minD) { minD = dist; closest = b; }
            }
          } catch(e) {}
        }
      }

      if (closest && minD <= 30) {
        featureCollection.features.push({
          type: 'Feature',
          geometry: closest.geometry,
          properties: {
            venue_id: venue.id,
            name: venue.name,
            type: venue.type,
            hasSpecials: !!venue.late_night_eligible,
            height: 10
          }
        });
        matchCount++;
        process.stdout.write('🏢');
      } else {
        const fallD = 0.0001; 
        const fallbackGeom = {
          type: "Polygon",
          coordinates: [[
            [coords.lng - fallD, coords.lat - fallD],
            [coords.lng + fallD, coords.lat - fallD],
            [coords.lng + fallD, coords.lat + fallD],
            [coords.lng - fallD, coords.lat + fallD],
            [coords.lng - fallD, coords.lat - fallD]
          ]]
        };
        featureCollection.features.push({
          type: 'Feature',
          geometry: fallbackGeom,
          properties: {
            venue_id: venue.id,
            name: venue.name,
            type: venue.type,
            hasSpecials: !!venue.late_night_eligible,
            height: 10,
            is_synthetic: true
          }
        });
        process.stdout.write('🟨');
      }
    } catch(err) {
      console.log(`Failed to fetch for ${venue.name}:`, err.message);
    }
  }

  const path = 'public/civic_data/civic_venue_buildings.geojson';
  fs.writeFileSync(path, JSON.stringify(featureCollection, null, 2));
  console.log(`\n\nSync Complete! Extracted ${matchCount} perfect municipal building footprints.`);
}

run();
