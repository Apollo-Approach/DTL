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
  console.log("Loading local london_buildings.geojson (MapServer/3 Polygons)...");
  if (!fs.existsSync('london_buildings.geojson')) {
    console.error("Missing london_buildings.geojson. Please run download_london_buildings.js first.");
    process.exit(1);
  }
  
  const buildings = JSON.parse(fs.readFileSync('london_buildings.geojson', 'utf8'));
  console.log(`Loaded ${buildings.features.length} local polygon footprints.`);

  console.log("Fetching venues from Supabase...");
  const { data: venues } = await supabase.from('venues').select('id, name, type, late_night_eligible, location');
  
  const featureCollection = { type: "FeatureCollection", features: [] };
  let matchCount = 0;

  for (const venue of venues) {
    if (!venue.location) continue;
    const coords = decodePostGISPoint(venue.location);
    if (!coords) continue;
    
    const pt = turf.point([coords.lng, coords.lat]);
    
    // Efficient bounding box filter (0.005 degrees is ~500m, safe for large buildings)
    const threshold = 0.005; 
    let candidates = buildings.features.filter(b => {
      if (!b.geometry || !b.geometry.coordinates || !b.geometry.coordinates[0]) return false;
      let firstCoord;
      if (b.geometry.type === 'LineString') {
        firstCoord = b.geometry.coordinates[0];
      } else {
        firstCoord = b.geometry.coordinates[0][0];
      }
      if (!firstCoord || typeof firstCoord[0] !== 'number') return false;
      return Math.abs(firstCoord[0] - coords.lng) < threshold && Math.abs(firstCoord[1] - coords.lat) < threshold;
    });

    let closest = null;
    let minD = Infinity;

    // Assemble local shattered LineStrings into proper Polygons first
    const localLines = [];
    candidates.forEach(b => {
      if (b.geometry && b.geometry.type === 'LineString') {
        localLines.push(b);
      }
    });

    let localPolygons = [];
    if (localLines.length > 0) {
      try {
        const fc = turf.polygonize(turf.featureCollection(localLines));
        if (fc && fc.features) {
            localPolygons = fc.features;
        }
      } catch(e) {}
    }

    // Add any features that were ALREADY polygons
    candidates.forEach(b => {
      if (b.geometry && (b.geometry.type === 'Polygon' || b.geometry.type === 'MultiPolygon')) {
        localPolygons.push(b);
      }
    });

    for (const polyFeature of localPolygons) {
      if (!polyFeature.geometry) continue;
      
      try {
        if (turf.booleanPointInPolygon(pt, polyFeature)) {
          minD = 0;
          closest = polyFeature;
          break; // Perfect match inside the footprint
        }
      } catch(e) {}

      try {
        let lines = turf.polygonToLine(polyFeature);
        if (lines.type === 'FeatureCollection') {
          for (let f of lines.features) {
            let dist = turf.pointToLineDistance(pt, f, {units: 'meters'});
            if (dist < minD) { minD = dist; closest = polyFeature; }
          }
        } else {
          let dist = turf.pointToLineDistance(pt, lines, {units: 'meters'});
          if (dist < minD) { minD = dist; closest = polyFeature; }
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
  }

  const path = 'public/civic_data/civic_venue_buildings.geojson';
  fs.writeFileSync(path, JSON.stringify(featureCollection, null, 2));
  console.log(`\n\nLocal Sync Complete! Extracted ${matchCount} perfect municipal building footprints.`);
}

run();
