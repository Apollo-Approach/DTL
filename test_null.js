import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkNull() {
  const { data, error } = await supabase.from('venues_public').select('name, type, lat, lng');
  if (data) {
    const nullCoords = data.filter(v => v.lat === null || v.lng === null);
    console.log("Venues with null coords:", nullCoords);
    console.log("Total venues:", data.length);
  }
}

checkNull();
