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
  const email = 'plaidjedi@gmail.com';
  const role = 'm5_sysadmin';
  
  // Get user from auth.users
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error("User error:", userError);
    return;
  }
  
  const targetUser = users.users.find(u => u.email === email);
  if (!targetUser) {
    console.log(`User ${email} not found in auth.users.`);
    return;
  }
  
  // Update profile
  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', targetUser.id)
    .select();
    
  if (updateError) {
    console.error("Update error:", updateError);
  } else {
    console.log(`Successfully elevated ${email} to ${role}. Profile:`, profile);
  }
}
run();
