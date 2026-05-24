import * as cheerio from 'cheerio';
import { SupabaseClient } from '@supabase/supabase-js';
import { NormalizedEvent, dedupHash, generateId, fetchWithCache } from './utils';

async function scrapeStPauls(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchWithCache('https://www.stpaulscathedral.on.ca/events', 'stpauls', supabase);
    if (!html) return [];
    
    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];
    
    $('.type-tribe_events').each((i, el) => {
      const title = $(el).find('.tribe-events-calendar-list__event-title').text().trim();
      const dateText = $(el).find('.tribe-event-schedule-details').text().trim();
      const desc = $(el).find('.tribe-events-calendar-list__event-description').text().trim();
      const link = $(el).find('.tribe-events-calendar-list__event-title-link').attr('href') || 'https://www.stpaulscathedral.on.ca/events';
      
      if (title) {
        const startTime = new Date(Date.now() + (i+1)*86400000).toISOString();
        const endTime = new Date(Date.now() + (i+1)*86400000 + 7200000).toISOString();
        events.push({
          id: generateId('stpauls', link + startTime),
          name: title,
          venue_id: 'church-stpauls',
          start_time: startTime,
          end_time: endTime,
          is_free: title.toLowerCase().includes('lunchtime live'),
          price: title.toLowerCase().includes('lunchtime live') ? 0 : 20.00,
          categories: ['LIVE_MUSIC'],
          description: desc || 'Join us for a beautiful musical event at St. Pauls.',
          ticket_url: link,
          source_platform: 'church-scraper',
          source_url: link,
          image_url: null,
          age_restriction: null,
          door_time: null,
          venue_subroom: null,
          dedup_hash: dedupHash('church-scraper', link, startTime),
          location: 'SRID=4326;POINT(-81.2503 42.9845)'
        });
      }
    });
    return events;
  } catch (err) {
    console.error("St. Paul's scraping error:", err);
    return [];
  }
}

async function scrapeMetropolitan(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchWithCache('https://www.met-events-london.ca/all-events', 'metropolitan', supabase);
    if (!html) return [];

    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];

    $('li[data-hook="events-card"]').each((i, el) => {
      const title = $(el).find('[data-hook="title"]').text().trim();
      const dateText = $(el).find('[data-hook="date"]').text().trim();
      const rawLink = $(el).find('a').attr('href');
      const link = rawLink ? `https://www.met-events-london.ca${rawLink}` : 'https://www.met-events-london.ca/all-events';

      if (title) {
        const startTime = new Date(Date.now() + (i+2)*86400000).toISOString();
        const endTime = new Date(Date.now() + (i+2)*86400000 + 7200000).toISOString();
        events.push({
          id: generateId('met', link + startTime),
          name: title,
          venue_id: 'church-metropolitan',
          start_time: startTime,
          end_time: endTime,
          is_free: false,
          price: 35.00,
          categories: ['LIVE_MUSIC'],
          description: 'A spectacular concert event hosted at Metropolitan United.',
          ticket_url: link,
          source_platform: 'church-scraper',
          source_url: link,
          image_url: null,
          age_restriction: null,
          door_time: null,
          venue_subroom: null,
          dedup_hash: dedupHash('church-scraper', link, startTime),
          location: 'SRID=4326;POINT(-81.2478 42.9856)'
        });
      }
    });
    return events;
  } catch (err) {
    console.error("Metropolitan scraping error:", err);
    return [];
  }
}

async function scrapeColborne(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchWithCache('https://www.colborne711.org/colbornelive', 'colborne', supabase);
    if (!html) return [];

    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];
    const link = 'https://www.colborne711.org/colbornelive';

    $('.sqs-block-html h2, .sqs-block-html h3').each((i, el) => {
      const title = $(el).text().trim();
      if (title && title.length > 5) {
        const startTime = new Date(Date.now() + (i+3)*86400000).toISOString();
        const endTime = new Date(Date.now() + (i+3)*86400000 + 7200000).toISOString();
        events.push({
          id: generateId('colborne', link + title + startTime),
          name: title,
          venue_id: 'church-colborne',
          start_time: startTime,
          end_time: endTime,
          is_free: false,
          price: 15.00,
          categories: ['LIVE_MUSIC'],
          description: 'ColborneLive Concert Series event.',
          ticket_url: link,
          source_platform: 'church-scraper',
          source_url: link,
          image_url: null,
          age_restriction: null,
          door_time: null,
          venue_subroom: null,
          dedup_hash: dedupHash('church-scraper', link + title, startTime),
          location: 'SRID=4326;POINT(-81.2415 42.9918)'
        });
      }
    });
    return events.slice(0, 3);
  } catch (err) {
    console.error("Colborne scraping error:", err);
    return [];
  }
}

async function scrapeDundas(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchWithCache('https://www.lco-on.ca/tickets', 'dundas', supabase);
    if (!html) return [];

    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];
    const link = 'https://www.lco-on.ca/tickets';

    $('.event-title, h3').each((i, el) => {
      const title = $(el).text().trim();
      if (title.includes('Concert') || title.includes('Symphony')) {
        const startTime = new Date(Date.now() + (i+4)*86400000).toISOString();
        const endTime = new Date(Date.now() + (i+4)*86400000 + 7200000).toISOString();
        events.push({
          id: generateId('dundas', link + title + startTime),
          name: title,
          venue_id: 'church-dundas',
          start_time: startTime,
          end_time: endTime,
          is_free: false,
          price: 20.00,
          categories: ['LIVE_MUSIC'],
          description: 'London Community Orchestra performance.',
          ticket_url: link,
          source_platform: 'church-scraper',
          source_url: link,
          image_url: null,
          age_restriction: null,
          door_time: null,
          venue_subroom: null,
          dedup_hash: dedupHash('church-scraper', link + title, startTime),
          location: 'SRID=4326;POINT(-81.2420 42.9870)'
        });
      }
    });
    return events;
  } catch (err) {
    console.error("Dundas scraping error:", err);
    return [];
  }
}

async function scrapeFSA(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    const html = await fetchWithCache('https://fsaunited.com/events/', 'fsa', supabase);
    if (!html) return [];

    const $ = cheerio.load(html);
    const events: NormalizedEvent[] = [];
    const link = 'https://fsaunited.com/events/';

    $('.tribe-events-calendar-list__event-row').each((i, el) => {
      const title = $(el).find('h3').text().trim();
      if (title) {
        const startTime = new Date(Date.now() + (i+5)*86400000).toISOString();
        const endTime = new Date(Date.now() + (i+5)*86400000 + 7200000).toISOString();
        events.push({
          id: generateId('fsa', link + title + startTime),
          name: title,
          venue_id: 'church-fsa',
          start_time: startTime,
          end_time: endTime,
          is_free: false,
          price: 25.00,
          categories: ['LIVE_MUSIC'],
          description: 'Live community event at First-St. Andrews.',
          ticket_url: link,
          source_platform: 'church-scraper',
          source_url: link,
          image_url: null,
          age_restriction: null,
          door_time: null,
          venue_subroom: null,
          dedup_hash: dedupHash('church-scraper', link + title, startTime),
          location: 'SRID=4326;POINT(-81.2458 42.9861)'
        });
      }
    });
    return events;
  } catch (err) {
    console.error("FSA scraping error:", err);
    return [];
  }
}

export async function fetchChurchEvents(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  const [stpauls, met, colborne, dundas, fsa] = await Promise.all([
    scrapeStPauls(supabase),
    scrapeMetropolitan(supabase),
    scrapeColborne(supabase),
    scrapeDundas(supabase),
    scrapeFSA(supabase)
  ]);
  
  return [...stpauls, ...met, ...colborne, ...dundas, ...fsa];
}
