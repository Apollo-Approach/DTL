import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const fixes = [
    { name: "Gnosh Dining & Cocktails", location: "POINT(-81.3617601 42.9668809)" },
    { name: "Cafe Organique", location: "POINT(-81.2484957 42.9818706)" },
    { name: "Wolf Performance Hall", location: "POINT(-81.2463889 42.9844444)" }
  ];
  
  for (const f of fixes) {
    const { error } = await supabase.from('venues').update({ location: f.location }).eq('name', f.name);
    if (error) console.error(error);
    else console.log(`Fixed ${f.name}`);
  }
}

fix()
