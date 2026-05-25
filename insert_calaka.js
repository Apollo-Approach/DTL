import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function insert() {
  const calaka = {
    id: crypto.randomUUID(),
    name: "La Calaka Mexican Cuisine & Cantina",
    description: "Authentic Mexican cuisine and cantina in downtown London.",
    address: "117 Dundas St",
    type: "restaurant",
    status: "PERMANENT",
    location: "POINT(-81.25129 42.9830503)",
    offerings: {}
  }
  
  const { error } = await supabase.from('venues').insert(calaka);
  if (error) console.error(error);
  else console.log("Successfully inserted La Calaka!");
}

insert()
