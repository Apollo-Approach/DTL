const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: events, error } = await supabase
    .from('events')
    .select('name, start_time')
    .eq('venue_id', 'v-london-music-hall')
    .ilike('name', '%ALPHA WOLF%');
    
  console.log("Alpha wolf events:", events);
}
check();
