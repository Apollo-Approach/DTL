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

async function testMusicHall() {
  const { data: venues, error } = await supabase.from('venues').select('id, name, type, late_night_eligible, location').ilike('name', '%music hall%');
  
  const venue = venues[0];
  console.log("Venue:", venue.name);
  const dbCoords = decodePostGISPoint(venue.location);
  console.log("Coords:", dbCoords);
  
  const d = 0.0005;
  const geometryParam = encodeURIComponent(`{"xmin":${dbCoords.lng - d},"ymin":${dbCoords.lat - d},"xmax":${dbCoords.lng + d},"ymax":${dbCoords.lat + d},"spatialReference":{"wkid":4326}}`);
  const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_BaseMaps/MapServer/3/query?geometry=${geometryParam}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326&f=geojson`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.features) {
    console.log(`Found ${data.features.length} features`);
    if (data.features.length > 0) {
      console.log("Properties of first:", Object.keys(data.features[0].properties));
    }
  } else {
    console.log("No features!", data);
  }
}

testMusicHall();
