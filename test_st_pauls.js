import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

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

async function testStPauls() {
  const { data: venues, error } = await supabase.from('venues').select('name, location').ilike('name', '%paul%');
  
  if (venues && venues.length > 0) {
    const venue = venues[0];
    const coords = decodePostGISPoint(venue.location);
    console.log(`St Pauls Coordinates: lng ${coords.lng}, lat ${coords.lat}`);
  }
}

testStPauls();
