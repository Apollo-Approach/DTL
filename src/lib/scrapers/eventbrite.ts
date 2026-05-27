import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { NormalizedEvent } from '../../types';
import { matchEventToVenue } from './venueMatcher';

const EB_CATEGORY_MAP: Record<string, string> = {
  '103': 'LIVE_MUSIC',
  '105': 'ARTS_THEATRE',
  '104': 'ARTS_THEATRE', // Film
  '110': 'COMMUNITY', // Food & Drink
  '113': 'COMMUNITY', // Community
};

function dedupHash(platform: string, sourceUrl: string, startTime: string): string {
  return createHash('sha256')
    .update(`${platform}|${sourceUrl}|${startTime}`)
    .digest('hex')
    .substring(0, 32);
}

function generateId(prefix: string, seed: string): string {
  return `${prefix}-${createHash('sha256').update(seed).digest('hex').substring(0, 12)}`;
}

/**
 * Fetch events for a specific Eventbrite organizer ID
 */
async function fetchEventsForOrganizer(organizerId: string, apiKey: string): Promise<NormalizedEvent[]> {
  try {
    const url = `https://www.eventbriteapi.com/v3/organizers/${organizerId}/events/?status=live&expand=venue,ticket_classes`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) return [];

    const data = await res.json();
    const events: NormalizedEvent[] = [];

    for (const ebEvent of (data.events || [])) {
      const isFree = ebEvent.is_free;
      let minPrice = 0;

      if (!isFree && ebEvent.ticket_classes) {
        const paidTickets = ebEvent.ticket_classes.filter((tc: any) => !tc.free && tc.cost);
        if (paidTickets.length > 0) {
          minPrice = Math.min(...paidTickets.map((tc: any) => parseFloat(tc.cost.value || '0') / 100));
        }
      }

      const category = EB_CATEGORY_MAP[ebEvent.category_id] || 'COMMUNITY';

      let lat = 42.9849;
      let lng = -81.2453;
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
        venue_id: null,
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
        location: `SRID=4326;POINT(${lng} ${lat})`
      });
    }

    return events;
  } catch (err) {
    return [];
  }
}

/**
 * Fetch events broadly from the London ON Eventbrite directory
 */
async function fetchDirectoryEvents(): Promise<NormalizedEvent[]> {
  try {
    const url = 'https://www.eventbrite.ca/d/canada--london/events/';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!res.ok) {
      console.warn(`[Eventbrite Hybrid] Failed to fetch directory: ${res.status}`);
      return [];
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];

    // Parse Schema.org Event JSON-LD
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (!jsonText) return;

        let parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }

        parsed.forEach((schema: any) => {
          if (schema['@type'] !== 'Event') return;
          
          let lat = 42.9849;
          let lng = -81.2453;
          let venueSubroom = null;

          if (schema.location && schema.location['@type'] === 'Place' && schema.location.geo) {
            lat = parseFloat(schema.location.geo.latitude);
            lng = parseFloat(schema.location.geo.longitude);
            venueSubroom = schema.location.name || null;
          }

          const isFree = schema.offers && schema.offers.price === '0.00';
          const price = schema.offers && schema.offers.price ? parseFloat(schema.offers.price) : 0;

          // Deterministic Geographic Resolution!
          const venue_id = matchEventToVenue(lat, lng);

          events.push({
            id: generateId('eb-ld', schema.url || schema.name),
            name: schema.name,
            venue_id, // Found via GeoJSON Map
            start_time: schema.startDate,
            end_time: schema.endDate || new Date(new Date(schema.startDate).getTime() + 3 * 3600000).toISOString(),
            is_free: isFree,
            price: price,
            categories: ['COMMUNITY'], // Default
            description: schema.description || '',
            ticket_url: schema.url || null,
            source_platform: 'eventbrite',
            source_url: schema.url || null,
            image_url: schema.image || null,
            age_restriction: null,
            door_time: null,
            venue_subroom: venueSubroom,
            dedup_hash: dedupHash('eventbrite', schema.url || schema.name, schema.startDate),
            location: `SRID=4326;POINT(${lng} ${lat})`
          });
        });
      } catch (err) {
        // Silently skip unparseable JSON blocks
      }
    });

    return events;
  } catch (err) {
    console.error('[Eventbrite Hybrid] Directory fetch failed:', err);
    return [];
  }
}

/**
 * Combination approach:
 * 1. Fetch explicitly managed organizers from the DB.
 * 2. Fetch the broad directory for unmapped events.
 * 3. Combine and return them.
 */
export async function fetchEventbriteHybrid(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) {
    console.warn('[Eventbrite Hybrid] No EVENTBRITE_API_KEY found.');
    return [];
  }

  // 1. Fetch from Organizers
  let organizerEvents: NormalizedEvent[] = [];
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, location, offerings')
    .not('offerings->eventbrite_organizer_id', 'is', null);

  if (!error && venues && venues.length > 0) {
    const eventPromises = venues.map(async (venue) => {
      const orgId = venue.offerings.eventbrite_organizer_id;
      const ebEvents = await fetchEventsForOrganizer(orgId, apiKey);
      
      // Force venue mapping since we know the organizer is tied to this venue
      return ebEvents.map(ev => ({
        ...ev,
        venue_id: venue.id,
        location: venue.location // Fallback to DB location
      }));
    });

    const nestedEvents = await Promise.all(eventPromises);
    organizerEvents = nestedEvents.flat();
  }

  // 2. Fetch from Directory
  const directoryEvents = await fetchDirectoryEvents();

  // Combine them. The worker upsert uses `dedup_hash` (platform|url|start_time) 
  // with `ignoreDuplicates: true`, so duplicates between the two strategies are safely handled.
  return [...organizerEvents, ...directoryEvents];
}
