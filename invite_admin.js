const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inviteAndElevate() {
  const email = 'nicholas.saika@gmail.com';
  console.log(`Inviting ${email}...`);

  // 1. Send the invite
  const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email);
  
  if (authError) {
    console.error("Error inviting user:", authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`User invited successfully. User ID: ${userId}`);

  // 2. Elevate role in profiles table
  console.log(`Elevating role to m5_sysadmin...`);
  
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ 
      id: userId, 
      email: email,
      role: 'm5_sysadmin',
      first_name: 'Nicholas',
      last_name: 'Saika',
      updated_at: new Date().toISOString()
    });

  if (profileError) {
    console.error("Error elevating profile role:", profileError.message);
    process.exit(1);
  }

  console.log("Success! Account elevated to sysadmin.");
}

inviteAndElevate();
