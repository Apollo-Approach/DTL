import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function insert() {
  const burreria = {
    id: crypto.randomUUID(),
    name: "La Burreria London",
    description: "Authentic Mexican burritos located inside the Covent Garden Market.",
    address: "130 King St",
    type: "restaurant",
    status: "PERMANENT",
    location: "POINT(-81.250551 42.9827498)",
    offerings: {}
  }
  
  const { error } = await supabase.from('venues').insert(burreria);
  if (error) console.error(error);
  else console.log("Successfully inserted La Burreria!");
}

insert()
