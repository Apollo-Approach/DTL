import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

async function checkDatabase() {
  console.log('Checking database...');
  
  // Get count
  const { count, error: countError } = await supabase
    .from('transit_delay_log')
    .select('id', { count: 'exact', head: true });
    
  if (countError) {
    console.error('Error counting:', countError);
  } else {
    console.log(`Total rows currently in database: ${count}`);
  }

  // Get oldest record
  const { data: oldestData, error: oldestError } = await supabase
    .from('transit_delay_log')
    .select('recorded_at')
    .order('recorded_at', { ascending: true })
    .limit(1);

  if (oldestError) {
    console.error('Error getting oldest:', oldestError);
  } else if (oldestData && oldestData.length > 0) {
    console.log(`Oldest record in database: ${oldestData[0].recorded_at}`);
  }

  // Get newest record
  const { data: newestData, error: newestError } = await supabase
    .from('transit_delay_log')
    .select('recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(1);

  if (newestError) {
    console.error('Error getting newest:', newestError);
  } else if (newestData && newestData.length > 0) {
    console.log(`Newest record in database: ${newestData[0].recorded_at}`);
  }
}

checkDatabase();
