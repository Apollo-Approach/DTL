import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const { error } = await supabase
    .from('venues')
    .update({ location: 'POINT(-81.2551177 42.9826369)' })
    .eq('id', 'v-yayas')

  if (error) {
    console.error(error)
  } else {
    console.log("Fixed Yaya's Kitchen coordinates!")
  }
}

fix()
