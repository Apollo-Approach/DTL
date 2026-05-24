import { createAdminClient } from '@/lib/supabase/server';
import VenueManager from './VenueManager';

export default async function AdminVenuesPage() {
  const supabase = await createAdminClient();
  
  // Fetch venues
  const { data: venues } = await supabase
    .from('venues')
    .select('*')
    .order('name');

  return (
    <div className="max-w-7xl mx-auto pb-24">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Venue Management</h1>
          <p className="text-neutral-400">View, edit, and add new venues to the map. Mark manually curated venues to protect them from the automated scraper.</p>
        </div>
      </div>

      <VenueManager initialVenues={venues || []} />
    </div>
  );
}
