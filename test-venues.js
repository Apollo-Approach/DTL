const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
async function run() {
  const { data } = await supabase.from('venues_public').select('*');
  console.log('Total venues:', data.length);
  const nightlife = data.filter(v => ['club', 'bar', 'nightclub', 'lounge', 'night_club', 'pub', 'brewery'].includes(v.type));
  console.log('Nightlife venues:', nightlife.length);
}
run();
