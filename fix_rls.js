const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].replace(/"/g, '').trim();
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].replace(/"/g, '').trim();
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Let's create an RLS policy that allows users to select their own profile
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `
      CREATE POLICY "Users can view own profile" ON profiles
      FOR SELECT USING (auth.uid() = id);
    `
  });
  console.log("Create policy result:", data, error);
}
run();
