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
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error("User error:", userError);
    return;
  }
  const nick = users.users.find(u => u.email === 'nicholas.saika@gmail.com');
  if (nick) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', nick.id).single();
    console.log("Profile for nick:", profile);
  } else {
    console.log("Nicholas not found in auth.users");
  }
}
run();
