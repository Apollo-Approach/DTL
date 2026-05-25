import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function search() {
  const { data, error } = await supabase.from('venues').select('name, type, is_manually_curated').ilike('name', '%music hall%');
  console.log("Music Hall:", data, error);
  
  const { data: d2, error: e2 } = await supabase.from('venues').select('name, type, is_manually_curated').ilike('name', '%paul%');
  console.log("Paul:", d2, e2);
}

search();
