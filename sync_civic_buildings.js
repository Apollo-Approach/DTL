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
  console.log("Loading building dataset...");
  let buildings;
  if (fs.existsSync('london_buildings.geojson')) {
      buildings = JSON.parse(fs.readFileSync('london_buildings.geojson', 'utf8'));
  } else {
      const res = await fetch("https://hub.arcgis.com/api/v3/datasets/f5dd65b8b5fb440ab4092f6c8d2431f7_2/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1");
      buildings = await res.json();
      fs.writeFileSync('london_buildings.geojson', JSON.stringify(buildings));
  }
  
  // Convert LineStrings to Polygons
  let convertedCount = 0;
  for (let i = 0; i < buildings.features.length; i++) {
    const b = buildings.features[i];
    if (b.geometry && b.geometry.type === 'LineString') {
       let coords = b.geometry.coordinates;
       if (coords.length >= 3) {
           if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
               coords = [...coords, coords[0]]; // force close
           }
           b.geometry = { type: 'Polygon', coordinates: [coords] };
           convertedCount++;
       }
    }
  }
  console.log(`Converted ${convertedCount} LineStrings to Polygons`);
  
  const { data: venues } = await supabase.from('venues').select('id, name, type, late_night_eligible, location');
  
  const featureCollection = { type: "FeatureCollection", features: [] };
  let matchCount = 0;

  for (const venue of venues) {
    if (!venue.location) continue;
    const coords = decodePostGISPoint(venue.location);
    if (!coords) continue;
    
    const pt = turf.point([coords.lng, coords.lat]);
    let closest = null;
    let minD = Infinity;

    const threshold = 0.001; 
    const candidates = buildings.features.filter(b => {
      if (!b.geometry || !b.geometry.coordinates || !b.geometry.coordinates[0]) return false;
      const firstCoord = (b.geometry.type === 'Polygon' || b.geometry.type === 'MultiPolygon') 
                         ? b.geometry.coordinates[0][0] 
                         : b.geometry.coordinates[0];
      if (!firstCoord || typeof firstCoord[0] !== 'number') return false;
      return Math.abs(firstCoord[0] - coords.lng) < threshold && 
             Math.abs(firstCoord[1] - coords.lat) < threshold;
    });
    
    for (const b of candidates) {
      if (!b.geometry) continue;
      try {
        if (turf.booleanPointInPolygon(pt, b)) {
          minD = 0;
          closest = b;
          break; // Perfect match
        }
      } catch(e) {}
      
      try {
        let lines;
        if (b.geometry.type === 'Polygon') {
            lines = turf.polygonToLine(b);
        } else if (b.geometry.type === 'MultiPolygon') {
            lines = turf.polygonToLine(turf.polygon(b.geometry.coordinates[0])); // rough approx
        } else {
            continue;
        }

        if (lines.type === 'FeatureCollection') {
          for (let f of lines.features) {
            let d = turf.pointToLineDistance(pt, f, {units: 'meters'});
            if (d < minD) { minD = d; closest = b; }
          }
        } else {
          let d = turf.pointToLineDistance(pt, lines, {units: 'meters'});
          if (d < minD) { minD = d; closest = b; }
        }
      } catch(e) {}
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
      const d = 0.0001; 
      const fallbackGeom = {
        type: "Polygon",
        coordinates: [[
          [coords.lng - d, coords.lat - d],
          [coords.lng + d, coords.lat - d],
          [coords.lng + d, coords.lat + d],
          [coords.lng - d, coords.lat + d],
          [coords.lng - d, coords.lat - d]
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
  }

  const path = 'public/civic_data/civic_venue_buildings.geojson';
  fs.writeFileSync(path, JSON.stringify(featureCollection, null, 2));
  console.log(`\n\nSync Complete! Extracted ${matchCount} perfect municipal building footprints.`);
}

run();
