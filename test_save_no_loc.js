import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSave() {
  const payload = {
    name: "Test Venue Edit Without Location",
    description: "Testing update"
  }

  const { error } = await supabase.from('venues').update(payload).eq('id', 'v-abruzzi')
  
  if (error) {
    console.error("Supabase Error:", error)
  } else {
    console.log("Success!")
  }
}

testSave()
