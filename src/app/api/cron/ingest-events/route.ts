import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { fetchChurchEvents } from '@/lib/scrapers/churches';
import { fetchEventbriteEvents } from '@/lib/scrapers/eventbrite';

/**
 * Event Ingestion Cron — Sprint 2.1 + 2.2
 *
 * Automated pipeline that fetches events from multiple sources,
 * normalizes them to DTL's Event schema, deduplicates via SHA-256 hash,
 * and upserts into the Supabase `events` table.
 *
 * Sources:
 *   1. Ticketmaster Discovery API v2 (London, ON venues)
 *   2. London Music Hall WordPress REST API (/wp-json/wp/v2/tm_event)
 *
 * Schedule: Every 6 hours (Vercel Cron)
 * Rate limits: Ticketmaster 5,000/day, LMH unlimited (own API)
 *
 * @see Research/Venue Event API Research Strategy.md
 * @see Research/Civic Data Pipeline Architecture - Event Scraping Sources.md
 */

// ── Venue ID mapping for source-to-DTL resolution ──
const VENUE_MAP: Record<string, string> = {
  // Ticketmaster venue IDs → DTL venue IDs
  '131820': 'v-london-music-hall',     // London Music Hall
  '340223': 'v-budweiser-gardens',     // Canada Life Place / Budweiser Gardens
  '132078': 'v-budweiser-gardens',     // Alternate ID for Canada Life Place
  '131548': 'v-centennial',            // Centennial Hall
  // Add more as discovered
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

interface NormalizedEvent {
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
  location: string; // PostGIS POINT WKT
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Generate a deterministic dedup hash for an event.
 * SHA-256 of (source_platform + source_url + start_time)
 */
function dedupHash(platform: string, sourceUrl: string, startTime: string): string {
  return createHash('sha256')
    .update(`${platform}|${sourceUrl}|${startTime}`)
    .digest('hex')
    .substring(0, 32); // 32-char hex = 128 bits, more than enough
}

// ── Ticketmaster Discovery API ──

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

async function fetchTicketmasterEvents(apiKey: string): Promise<NormalizedEvent[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    city: 'London',
    stateCode: 'ON',
    countryCode: 'CA',
    latlong: '42.9849,-81.2453',
    radius: '30',
    unit: 'km',
    size: '50',
    sort: 'date,asc',
    startDateTime: new Date().toISOString().split('.')[0] + 'Z'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'DTL-EventPipeline/2.0' }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[Event Ingest] Ticketmaster rate limit reached');
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
      const venueId = venue?.id as string | undefined;
      const venueLocation = venue?.location as Record<string, unknown> | undefined;
      const lat = venueLocation?.latitude ? parseFloat(venueLocation.latitude as string) : 42.9849;
      const lng = venueLocation?.longitude ? parseFloat(venueLocation.longitude as string) : -81.2453;

      const dates = event.dates as Record<string, unknown> | undefined;
      const start = dates?.start as Record<string, unknown> | undefined;
      const localDate = (start?.localDate as string) || new Date().toISOString().split('T')[0];
      const localTime = (start?.localTime as string) || '20:00:00';

      const startTime = `${localDate}T${localTime}-04:00`; // EDT
      const endTime = new Date(new Date(startTime).getTime() + 3 * 3600000).toISOString(); // +3h default

      const priceRanges = event.priceRanges as Array<Record<string, unknown>> | undefined;
      const minPrice = priceRanges?.[0]?.min as number ?? 0;
      const isFree = minPrice === 0;

      const classifications = event.classifications as Array<Record<string, unknown>> | undefined;
      const genre = (classifications?.[0]?.genre as Record<string, unknown>)?.name as string | undefined;
      const category = genre ? (GENRE_TO_CATEGORY[genre] || 'LIVE_MUSIC') : 'LIVE_MUSIC';

      const images = event.images as Array<Record<string, unknown>> | undefined;
      const bestImage = images?.find(img =>
        (img.ratio === '16_9' || img.ratio === '3_2') &&
        (img.width as number) >= 300 && (img.width as number) <= 800
      );

      const sourceUrl = (event.url as string) || '';
      const ageRestrictions = (event.ageRestrictions as Record<string, unknown> | undefined);
      const ageMin = ageRestrictions?.legalAgeEnforced as boolean;

      return {
        id: `tm-${event.id}`,
        name: event.name as string,
        venue_id: venueId ? (VENUE_MAP[venueId] || null) : null,
        start_time: startTime,
        end_time: endTime,
        is_free: isFree,
        price: minPrice,
        categories: [category],
        description: (event.info as string) || (event.pleaseNote as string) || '',
        ticket_url: sourceUrl || null,
        source_platform: 'ticketmaster',
        source_url: sourceUrl || null,
        image_url: (bestImage?.url || images?.[0]?.url || null) as string | null,
        age_restriction: ageMin ? '19+' : null,
        door_time: null,
        venue_subroom: null,
        dedup_hash: dedupHash('ticketmaster', sourceUrl, startTime),
        location: `SRID=4326;POINT(${lng} ${lat})`,
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Event Ingest] Ticketmaster error:', err);
    return [];
  }
}

// ── London Music Hall — RSS Feed + Page Scraping ──
// The tm_event CPT isn't exposed on LMH's WordPress REST API,
// so we use their RSS feed for event titles/links/descriptions,
// then scrape individual event pages for dates, times, and images.

const LMH_RSS = 'https://londonmusichall.com/events/feed/';

interface RSSItem {
  title: string;
  link: string;
  description: string;
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = block.match(/<title>(.*?)<\/title>/)?.[1] || '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';

    // Extract description from CDATA
    const descMatch = block.match(/<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/i);
    const contentMatch = block.match(/<content:encoded>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content:encoded>/i);
    const rawDesc = contentMatch?.[1] || descMatch?.[1] || '';

    // Strip HTML and boilerplate
    const description = rawDesc
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#8211;/g, '–')
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/The post .* appeared first on London Music Hall\./i, '')
      .trim()
      .substring(0, 500);

    if (title && link) {
      items.push({
        title: title
          .replace(/&amp;/g, '&')
          .replace(/&#8211;/g, '–')
          .replace(/&#8217;/g, "'")
          .replace(/&#8216;/g, "'"),
        link,
        description,
      });
    }
  }

  return items;
}

const MONTH_MAP: Record<string, string> = {
  'january': '01', 'february': '02', 'march': '03', 'april': '04',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12',
};

/**
 * Scrape an individual LMH event page for date, time, and OG image.
 */
async function scrapeEventPage(url: string): Promise<{
  date: string | null;
  time: string | null;
  imageUrl: string | null;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'DTL-EventPipeline/2.0' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { date: null, time: null, imageUrl: null };

    const html = await res.text();

    // Extract date: "May 22, 2026" pattern
    const dateMatch = html.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i
    );
    let date: string | null = null;
    if (dateMatch) {
      const month = MONTH_MAP[dateMatch[1].toLowerCase()];
      const day = dateMatch[2].padStart(2, '0');
      date = `${dateMatch[3]}-${month}-${day}`;
    }

    // Extract time: "10:00 PM" pattern
    const timeMatch = html.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/i);
    let time: string | null = null;
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      time = `${hours.toString().padStart(2, '0')}:${minutes}:00`;
    }

    // OG image
    const ogMatch = html.match(/property="og:image"\s+content="([^"]*)"/i);
    const imageUrl = ogMatch?.[1] || null;

    return { date, time, imageUrl };
  } catch {
    return { date: null, time: null, imageUrl: null };
  }
}

async function fetchLMHEvents(): Promise<NormalizedEvent[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(LMH_RSS, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'DTL-EventPipeline/2.0' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`LMH RSS feed ${res.status}`);
    }

    const xml = await res.text();
    const rssItems = parseRSSItems(xml);

    // Scrape individual event pages for dates (limit to 10 to stay fast)
    const eventPromises = rssItems.slice(0, 10).map(async (item): Promise<NormalizedEvent | null> => {
      const pageData = await scrapeEventPage(item.link);

      // Skip events where we can't determine a date
      if (!pageData.date) {
        console.warn(`[LMH] No date found for: ${item.title}`);
        return null;
      }

      const eventTime = pageData.time || '20:00:00';
      const startTime = `${pageData.date}T${eventTime}-04:00`; // EDT
      const endTime = new Date(new Date(startTime).getTime() + 4 * 3600000).toISOString();

      // Extract price from description
      const priceMatch = item.description.match(/\$(\d+(?:\.\d{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

      return {
        id: `lmh-${createHash('sha256').update(item.link).digest('hex').substring(0, 12)}`,
        name: item.title,
        venue_id: 'v-london-music-hall',
        start_time: startTime,
        end_time: endTime,
        is_free: price === 0,
        price,
        categories: ['LIVE_MUSIC'],
        description: item.description,
        ticket_url: item.link,
        source_platform: 'lmh-wordpress',
        source_url: item.link,
        image_url: pageData.imageUrl,
        age_restriction: '19+',
        door_time: null,
        venue_subroom: null,
        dedup_hash: dedupHash('lmh-wordpress', item.link, startTime),
        location: 'SRID=4326;POINT(-81.2489 42.9857)', // 185 Queens Ave
      };
    });

    const results = await Promise.all(eventPromises);
    return results.filter((e): e is NormalizedEvent => e !== null);
  } catch (err) {
    console.error('[Event Ingest] LMH scraping error:', err);
    return [];
  }
}

// ── Main cron handler ──

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    ticketmaster: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
    lmh: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
    churches: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
    eventbrite: { fetched: 0, inserted: 0, skipped: 0, errors: 0 },
  };

  try {
    // ── Fetch from all sources in parallel ──
    const apiKey = process.env.TICKETMASTER_API_KEY;
    const [tmEvents, lmhEvents, churchEvents, ebEvents] = await Promise.all([
      apiKey ? fetchTicketmasterEvents(apiKey) : Promise.resolve([]),
      fetchLMHEvents(),
      fetchChurchEvents(supabase),
      fetchEventbriteEvents(),
    ]);

    results.ticketmaster.fetched = tmEvents.length;
    results.lmh.fetched = lmhEvents.length;
    results.churches.fetched = churchEvents.length;
    results.eventbrite.fetched = ebEvents.length;

    const allEvents = [...tmEvents, ...lmhEvents, ...churchEvents, ...ebEvents];

    // ── Upsert each event (dedup by hash) ──
    for (const event of allEvents) {
      const source = event.source_platform === 'ticketmaster' 
        ? 'ticketmaster' 
        : (event.source_platform === 'church-scraper' 
          ? 'churches' 
          : (event.source_platform === 'eventbrite' ? 'eventbrite' : 'lmh'));

      try {
        const { error } = await supabase
          .from('events')
          .upsert(
            {
              id: event.id,
              name: event.name,
              venue_id: event.venue_id,
              start_time: event.start_time,
              end_time: event.end_time,
              is_free: event.is_free,
              price: event.price,
              categories: event.categories,
              description: event.description,
              ticket_url: event.ticket_url,
              source_platform: event.source_platform,
              source_url: event.source_url,
              image_url: event.image_url,
              age_restriction: event.age_restriction,
              door_time: event.door_time,
              venue_subroom: event.venue_subroom,
              dedup_hash: event.dedup_hash,
              location: event.location,
            },
            { onConflict: 'dedup_hash', ignoreDuplicates: true }
          );

        if (error) {
          // Duplicate hash = already exists, which is fine
          if (error.code === '23505') {
            results[source].skipped++;
          } else {
            console.error(`[Event Ingest] Upsert error for ${event.id}:`, error.message);
            results[source].errors++;
          }
        } else {
          results[source].inserted++;
        }
      } catch {
        results[source].errors++;
      }
    }

    // ── Purge stale events (past events older than 24 hours) ──
    const yesterday = new Date(Date.now() - 24 * 3600000).toISOString();
    const { count: purged } = await supabase
      .from('events')
      .delete({ count: 'exact' })
      .lt('end_time', yesterday)
      .in('source_platform', ['ticketmaster', 'lmh-wordpress', 'church-scraper', 'eventbrite']);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      total_ingested: tmEvents.length + lmhEvents.length + churchEvents.length + ebEvents.length,
      total_persisted: results.ticketmaster.inserted + results.lmh.inserted + results.churches.inserted + results.eventbrite.inserted,
      stale_purged: purged || 0,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Event Ingest] Fatal error:', message);
    return NextResponse.json({ error: message, results }, { status: 500 });
  }
}
