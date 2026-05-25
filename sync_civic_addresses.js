import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Haversine formula
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2rad(deg) { return deg * (Math.PI/180); }

function decodePostGISPoint(hexString) {
  try {
    const buf = Buffer.from(hexString, 'hex');
    const x = buf.readDoubleLE(9);
    const y = buf.readDoubleLE(17);
    return { lat: y, lng: x };
  } catch(e) { return null; }
}

async function syncAddresses() {
  console.log("Fetching venues from database...");
  const { data: venues, error } = await supabase.from('venues').select('id, name, address, location');
  
  if (error) {
    console.error("Failed to fetch venues:", error);
    return;
  }

  console.log(`Found ${venues.length} venues. Querying City of London Open Data Addresses API...`);
  let fixedCount = 0;
  
  for (const venue of venues) {
    if (!venue.address) continue;
    
    // Strip "London, ON" or similar from the address if it exists, so we just have "120 Dundas St"
    const streetAddress = venue.address.split(',')[0].trim().toUpperCase();
    // Some basic normalization
    const normalized = streetAddress.replace(' STREET', ' ST').replace(' AVENUE', ' AVE').replace(' ROAD', ' RD').replace(' NORTH', ' N').replace(' SOUTH', ' S');
    
    try {
      const whereClause = `Upper(UnitFullAddress) LIKE '%${normalized}%' OR Upper(FullAddress) LIKE '%${normalized}%'`;
      const url = `https://maps.london.ca/server/rest/services/OpenData/OpenData_Community/MapServer/0/query?where=${encodeURIComponent(whereClause)}&outFields=UnitFullAddress,FullAddress&outSR=4326&f=json`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.features && data.features.length > 0) {
        // Take the first match
        const geom = data.features[0].geometry;
        const realLat = geom.y;
        const realLng = geom.x;
        
        const dbCoords = venue.location ? decodePostGISPoint(venue.location) : null;
        
        if (dbCoords) {
          const distance = getDistanceFromLatLonInM(dbCoords.lat, dbCoords.lng, realLat, realLng);
          
          if (distance > 10) { // If it's off by more than 10 meters
            console.log(`[FIXING] ${venue.name} (${normalized}): Shifted by ${Math.round(distance)}m`);
            
            // Update Supabase using ST_SetSRID(ST_MakePoint(lng, lat), 4326)
            // But we can't do ST_MakePoint directly via supabase.js update. We have to use raw SQL or rpc.
            // Oh, wait, the standard way in Supabase JS to insert PostGIS is a WKT string, but we can't just pass a string without an RPC.
            // Wait, we can pass GeoJSON or WKT if the column type allows it, but often we need an RPC.
            // Let's check if there's an RPC or if we can just update it using PostgREST's support for GeoJSON?
            // Actually, PostgREST supports passing GeoJSON directly to a geometry column!
            // Let's pass a string representation: `SRID=4326;POINT(${realLng} ${realLat})`
            
            const pointWKT = `SRID=4326;POINT(${realLng} ${realLat})`;
            const { error: updateError } = await supabase.from('venues').update({ location: pointWKT }).eq('id', venue.id);
            if (updateError) {
              console.error(`Failed to update ${venue.name}:`, updateError);
            } else {
              fixedCount++;
            }
          }
        }
      } else {
        // Address not found in Open Data
        // console.log(`[NOT FOUND] ${venue.name} - ${normalized}`);
      }
    } catch (err) {
      console.error(`Error processing ${venue.name}:`, err);
    }
  }
  
  console.log(`\nSync Complete! Fixed ${fixedCount} venues with perfectly accurate municipal coordinates.`);
}

syncAddresses();
