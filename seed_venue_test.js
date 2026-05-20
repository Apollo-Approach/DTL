const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seedTestData() {
  console.log('Seeding Test Data for Monetization Loop...');

  // 1. Create a test venue
  const venueId = 'test-venue-123';
  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .upsert({
      id: venueId,
      name: 'The Neon Lounge (Test)',
      description: 'A test lounge',
      address: '123 Fake Street',
      location: 'POINT(-81.2453 42.9849)'
    })
    .select()
    .single();

  if (venueError) throw venueError;
  console.log('✅ Created Test Venue:', venue.id);

  // 2. Create a test promotion for this venue
  const { data: promo, error: promoError } = await supabase
    .from('promotions')
    .insert({
      venue_id: venue.id,
      title: 'Free VIP Entry',
      description: 'Skip the line and enter for free before midnight.',
      discount_value: '100% OFF',
      active_until: new Date(Date.now() + 86400000).toISOString(),
      total_claims_allowed: 100
    })
    .select()
    .single();

  if (promoError) throw promoError;
  console.log('✅ Created Promotion:', promo.id);

  // 3. We need two users: a Venue Manager and a Regular User.
  // We can just create dummy auth users using admin API
  
  const { data: managerUser, error: managerError } = await supabase.auth.admin.createUser({
    email: 'manager@neontest.com',
    password: 'password123',
    email_confirm: true
  });
  if (managerError) throw managerError;

  const { data: regularUser, error: regularError } = await supabase.auth.admin.createUser({
    email: 'user@test.com',
    password: 'password123',
    email_confirm: true
  });
  if (regularError) throw regularError;

  console.log('✅ Created Users');

  // 4. Update the manager profile to link to the venue and set role
  await supabase.from('profiles').update({
    role: 'venue_manager',
    venue_id: venue.id
  }).eq('id', managerUser.user.id);

  const passCode = 'Test-Purple-Sloth-' + Math.floor(Math.random() * 1000);
  // 5. Generate a pass for the regular user
  const { data: pass, error: passError } = await supabase
    .from('user_passes')
    .insert({
      promotion_id: promo.id,
      user_id: regularUser.user.id,
      status: 'ISSUED',
      pass_code: passCode
    })
    .select()
    .single();

  if (passError) throw passError;
  
  console.log('✅ Generated User Pass!');
  console.log('\n--- HOW TO TEST IN BROWSER ---');
  console.log('1. Log into the web app using the Venue Manager account:');
  console.log('   Email: manager@neontest.com');
  console.log('   Pass:  password123');
  console.log('2. Navigate to http://localhost:3000/venue');
  console.log('3. Navigate to "Scan Pass" and type/paste the following Pass Code to redeem it:');
  console.log(`\n   ${pass.pass_code}\n`);
  console.log('4. Verify the dashboard updates to show 1 scan and $1.00 Accrued Fees!');
}

seedTestData().catch(console.error);
