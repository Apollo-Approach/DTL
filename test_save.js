import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSave() {
  const payload = {
    location: "SRID=4326;POINT(-81.2453 42.9849)",
    name: "Test Venue Edit"
  }

  // Get a random venue ID
  const { data: venues } = await supabase.from('venues').select('id').limit(1)
  const venueId = venues[0].id

  console.log("Updating venue", venueId, "with payload", payload)
  const { error } = await supabase.from('venues').update(payload).eq('id', venueId)
  
  if (error) {
    console.error("Supabase Error:", error)
  } else {
    console.log("Success!")
  }
}

testSave()
