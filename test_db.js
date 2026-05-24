const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

const envConfig = dotenv.config({ path: '.env.local' }).parsed;

const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error, count } = await supabase.from('venues').select('*', { count: 'exact' });
  console.log("venues error:", error);
}
run();
