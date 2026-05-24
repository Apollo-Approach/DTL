import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// The NormalizedEvent interface should be identical to the one in churches.ts or route.ts
export interface NormalizedEvent {
  id: string;
  name: string;
  venue_id: string | null;
  start_time: string;
  end_time: string;
  is_free: boolean;
  price: number;
  categories: string[];
  description: string;
  ticket_url: string | null;
  source_platform: string;
  source_url: string | null;
  image_url: string | null;
  age_restriction: string | null;
  door_time: string | null;
  venue_subroom: string | null;
  dedup_hash: string;
  location: string;
}

function dedupHash(platform: string, sourceUrl: string, startTime: string): string {
  return createHash('sha256')
    .update(\`\${platform}|\${sourceUrl}|\${startTime}\`)
    .digest('hex')
    .substring(0, 32);
}

function generateId(prefix: string, seed: string): string {
  return \`\${prefix}-\${createHash('sha256').update(seed).digest('hex').substring(0, 12)}\`;
}

// Convert Eventbrite category IDs to our DTL categories
const EB_CATEGORY_MAP: Record<string, string> = {
  '103': 'LIVE_MUSIC',
  '105': 'ARTS_THEATRE',
  '104': 'ARTS_THEATRE', // Film
  '110': 'COMMUNITY', // Food & Drink
  '113': 'COMMUNITY', // Community
};

/**
 * Fetch events for a specific Eventbrite organizer ID
 */
async function fetchEventsForOrganizer(organizerId: string, apiKey: string): Promise<NormalizedEvent[]> {
  try {
    const url = \`https://www.eventbriteapi.com/v3/organizations/\${organizerId}/events/?status=live&expand=venue,ticket_classes\`;
    const res = await fetch(url, {
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(\`[Eventbrite] Failed to fetch events for organizer \${organizerId}: \${res.statusText}\`);
      return [];
    }

    const data = await res.json();
    const events: NormalizedEvent[] = [];

    for (const ebEvent of (data.events || [])) {
      const isFree = ebEvent.is_free;
      let minPrice = 0;
      
      if (!isFree && ebEvent.ticket_classes) {
        // Find the cheapest paid ticket
        const paidTickets = ebEvent.ticket_classes.filter((tc: any) => !tc.free && tc.cost);
        if (paidTickets.length > 0) {
          minPrice = Math.min(...paidTickets.map((tc: any) => parseFloat(tc.cost.value || '0') / 100));
        }
      }

      const category = EB_CATEGORY_MAP[ebEvent.category_id] || 'COMMUNITY';
      
      let lat = 42.9849; // Default DTL lat
      let lng = -81.2453; // Default DTL lng
      if (ebEvent.venue && ebEvent.venue.latitude && ebEvent.venue.longitude) {
        lat = parseFloat(ebEvent.venue.latitude);
        lng = parseFloat(ebEvent.venue.longitude);
      }

      const startTime = ebEvent.start.utc;
      const endTime = ebEvent.end.utc;
      const sourceUrl = ebEvent.url;

      events.push({
        id: generateId('eb', ebEvent.id),
        name: ebEvent.name.text,
        venue_id: null, // We don't map EB venues to our DB yet, rely on PostGIS location
        start_time: startTime,
        end_time: endTime,
        is_free: isFree,
        price: minPrice,
        categories: [category],
        description: ebEvent.description.text || '',
        ticket_url: sourceUrl,
        source_platform: 'eventbrite',
        source_url: sourceUrl,
        image_url: ebEvent.logo?.original?.url || null,
        age_restriction: null,
        door_time: null,
        venue_subroom: ebEvent.venue?.name || null,
        dedup_hash: dedupHash('eventbrite', sourceUrl, startTime),
        location: \`SRID=4326;POINT(\${lng} \${lat})\`
      });
    }

    return events;
  } catch (err) {
    console.error(\`[Eventbrite] Error fetching for organizer \${organizerId}:\`, err);
    return [];
  }
}

/**
 * Discover Eventbrite events by querying all tracked organizers in Supabase
 */
export async function fetchEventbriteEvents(): Promise<NormalizedEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) {
    console.warn('[Eventbrite] No EVENTBRITE_API_KEY found. Skipping extraction.');
    return [];
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Fetch all tracked organizers
    const { data: organizers, error } = await supabase
      .from('eventbrite_organizers')
      .select('id, name');

    if (error) {
      console.error('[Eventbrite] DB Error fetching organizers:', error);
      return [];
    }

    if (!organizers || organizers.length === 0) {
      console.log('[Eventbrite] No organizers tracked yet.');
      return [];
    }

    // 2. Fetch events for each organizer in parallel
    const eventPromises = organizers.map(org => fetchEventsForOrganizer(org.id, apiKey));
    const nestedEvents = await Promise.all(eventPromises);

    // 3. Flatten and return
    const allEvents = nestedEvents.flat();
    
    // Update last_scraped_at timestamp for these organizers
    const organizerIds = organizers.map(o => o.id);
    if (organizerIds.length > 0) {
      await supabase
        .from('eventbrite_organizers')
        .update({ last_scraped_at: new Date().toISOString() })
        .in('id', organizerIds);
    }

    return allEvents;
  } catch (err) {
    console.error('[Eventbrite] Fatal error during extraction:', err);
    return [];
  }
}
