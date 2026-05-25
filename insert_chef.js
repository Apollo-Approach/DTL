import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function insert() {
  const chef = {
    id: crypto.randomUUID(),
    name: "The Chef's Table Café",
    description: "Fanshawe College's teaching restaurant and café.",
    address: "130 Dundas St",
    type: "cafe",
    status: "PERMANENT",
    location: "POINT(-81.2509 42.9835)",
    offerings: {}
  }
  
  const { error } = await supabase.from('venues').insert(chef);
  if (error) console.error(error);
  else console.log("Successfully inserted Chef's Table!");
}

insert()
