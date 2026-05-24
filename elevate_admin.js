const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function elevate() {
  const email = 'nicholas.saika@gmail.com';
  console.log(`Searching for ${email}...`);

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error.message);
    process.exit(1);
  }

  const user = data.users.find(u => u.email === email);
  if (!user) {
    console.error("User not found!");
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user. User ID: ${userId}`);

  console.log(`Elevating role to m5_sysadmin...`);
  
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ 
      role: 'm5_sysadmin',
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (profileError) {
    console.error("Error elevating profile role:", profileError.message);
    process.exit(1);
  }

  console.log("Success! Account elevated to sysadmin.");
}

elevate();
