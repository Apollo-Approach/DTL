import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const eats2Venues = [
  "FitzRay's",
  "Bear & Frankies",
  "El Furniture Warehouse",
  "The Morrissey House",
  "Wink's Eatery",
  "London Bicycle Café",
  "Church Key",
  "The Mule",
  "Talbot Bar & Grille",
  "Tasting Room",
  "Grace",
  "Fellini Koolini's",
  "Jack Astor's",
  "Covent Garden Market"
];

async function main() {
  const { data, error } = await supabase
    .from('venues')
    .update({ type: 'Eats 2' })
    .in('name', eats2Venues)
    .select();

  if (error) {
    console.error('Error updating venues:', error);
  } else {
    console.log(`Successfully updated ${data?.length} venues to Eats 2`);
  }
}

main();
