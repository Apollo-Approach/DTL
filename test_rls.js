const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let supabaseUrl = '';
let supabaseAnonKey = ''; // Using ANON key to test RLS!

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].replace(/"/g, '').trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supabaseAnonKey = line.split('=')[1].replace(/"/g, '').trim();
});

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', '0a1fdb42-486b-475a-9c68-8497eb855c05').single();
  console.log("RLS Check - Profile:", profile, "Error:", error);
}
run();
