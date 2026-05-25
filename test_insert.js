import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testInsert() {
  const payload = {
    name: "Test Venue Edit",
    description: "Testing insert",
    type: "bar",
    image_url: "",
    is_manually_curated: true,
    offerings: {},
    location: "SRID=4326;POINT(-81.2453 42.9849)"
  }

  const { error } = await supabase.from('venues').insert([payload])
  
  if (error) {
    console.error("Supabase Error:", error)
  } else {
    console.log("Success!")
  }
}

testInsert()
