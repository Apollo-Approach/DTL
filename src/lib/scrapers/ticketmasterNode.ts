import { createHash } from 'crypto';
import { NormalizedEvent } from '../../types';
import { matchEventToVenue } from './venueMatcher';

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

const VENUE_MAP_FALLBACK: Record<string, string> = {
  '131820': 'v-london-music-hall',     // London Music Hall
  '340223': 'v-budweiser-gardens',     // Canada Life Place / Budweiser Gardens
  '132078': 'v-budweiser-gardens',     // Alternate ID for Canada Life Place
  '131548': 'v-centennial',            // Centennial Hall
};

// Ticketmaster genre → DTL event_category mapping
const GENRE_TO_CATEGORY: Record<string, string> = {
  'Music': 'LIVE_MUSIC',
  'Rock': 'LIVE_MUSIC',
  'Pop': 'LIVE_MUSIC',
  'Hip-Hop/Rap': 'LIVE_MUSIC',
  'R&B': 'LIVE_MUSIC',
  'Country': 'LIVE_MUSIC',
  'Classical': 'ARTS_THEATRE',
  'Jazz': 'LIVE_MUSIC',
  'Metal': 'LIVE_MUSIC',
  'Alternative': 'LIVE_MUSIC',
  'Comedy': 'ARTS_THEATRE',
  'Theatre': 'ARTS_THEATRE',
  'Dance/Electronic': 'DJ_CLUB',
  'Family': 'COMMUNITY',
  'Sports': 'COMMUNITY',
  'Festival': 'COMMUNITY',
};

function dedupHash(platform: string, sourceUrl: string, startTime: string): string {
  return createHash('sha256')
    .update(`${platform}|${sourceUrl}|${startTime}`)
    .digest('hex')
    .substring(0, 32);
}

export async function fetchTicketmasterEvents(apiKey: string): Promise<NormalizedEvent[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    city: 'London',
    stateCode: 'ON',
    countryCode: 'CA',
    latlong: '42.9849,-81.2453',
    radius: '30',
    unit: 'km',
    size: '200',
    sort: 'date,asc',
    startDateTime: new Date().toISOString().split('.')[0] + 'Z'
  });

  try {
    const res = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`, {
      headers: { 'User-Agent': 'DTL-AggregatorWorker/3.0' }
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[Ticketmaster Worker] Rate limit reached');
        return [];
      }
      throw new Error(`Ticketmaster API ${res.status}`);
    }

    const data = await res.json();
    const events = data?._embedded?.events || [];

    return events.map((event: Record<string, unknown>): NormalizedEvent => {
      const embedded = event._embedded as Record<string, unknown> | undefined;
      const venues = embedded?.venues as Array<Record<string, unknown>> | undefined;
      const venue = venues?.[0];
      const venueLocation = venue?.location as Record<string, unknown> | undefined;
      const lat = venueLocation?.latitude ? parseFloat(venueLocation.latitude as string) : 42.9849;
      const lng = venueLocation?.longitude ? parseFloat(venueLocation.longitude as string) : -81.2453;

      const dates = event.dates as Record<string, unknown> | undefined;
      const start = dates?.start as Record<string, unknown> | undefined;
      const localDate = (start?.localDate as string) || new Date().toISOString().split('T')[0];
      const localTime = (start?.localTime as string) || '20:00:00';

      const startTime = `${localDate}T${localTime}-04:00`; // EDT
      const sourceUrl = (event.url as string) || '';

      const venueId = venue?.id as string | undefined;

      // Deterministic Ray-Casting Match
      let finalVenueId: string | null = null;
      if (venueId && VENUE_MAP_FALLBACK[venueId]) {
        finalVenueId = VENUE_MAP_FALLBACK[venueId];
      }
      if (!finalVenueId && lat && lng) {
        finalVenueId = matchEventToVenue(lat, lng);
      }

      return {
        id: `tm-${event.id}`,
        name: event.name as string,
        venue_id: finalVenueId,
        start_time: startTime,
        best_link: sourceUrl || null,
        dedup_hash: dedupHash('ticketmaster', sourceUrl, startTime),
      };
    });
  } catch (err) {
    console.error('[Ticketmaster Worker] error:', err);
    return [];
  }
}
