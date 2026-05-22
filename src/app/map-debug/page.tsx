import { createClient } from '@/lib/supabase/server';
import { VENUE_CATEGORIES } from '@/components/map/mapHelpers';
import ClientMapDebug from './ClientMapDebug';

export const dynamic = 'force-dynamic';

export default async function MapDebugPage() {
  const supabase = await createClient();
  const { data: venues } = await supabase
    .from('venues_public')
    .select('*')
    .in('type', [...VENUE_CATEGORIES.Eatery, ...VENUE_CATEGORIES.Bars, ...VENUE_CATEGORIES.Stage]);
  return <ClientMapDebug venues={venues || []} />;
}

