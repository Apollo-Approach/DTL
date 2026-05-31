import { createAdminClient } from '@/lib/supabase/server';
import EventManager from './EventManager';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const supabase = await createAdminClient();
  
  // Fetch upcoming events
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .order('name', { ascending: true });

  return (
    <div className="max-w-7xl mx-auto pb-24">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Upcoming Events Management</h1>
          <p className="text-neutral-400">View, edit, and verify upcoming events scraped from venues.</p>
        </div>
      </div>

      <EventManager initialEvents={events || []} venues={venues || []} />
    </div>
  );
}
