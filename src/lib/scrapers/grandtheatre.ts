import * as cheerio from 'cheerio';
import { SupabaseClient } from '@supabase/supabase-js';
import { NormalizedEvent, dedupHash, generateId, fetchWithCache } from './utils';

const BASE_URL = 'https://www.grandtheatre.com';

function parseDateRange(text: string): { start: string, end: string } | null {
  const rangeRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+to\s+(January|February|March|April|May|June|July|August|September|October|November|December)?\s*(\d{1,2}),\s*(\d{4})/i;
  const singleRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i;

  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const startMonth = rangeMatch[1];
    const startDay = rangeMatch[2];
    const endMonth = rangeMatch[3] || startMonth;
    const endDay = rangeMatch[4];
    const year = rangeMatch[5];

    const startDate = new Date(`${startMonth} ${startDay}, ${year} 19:30:00`);
    const endDate = new Date(`${endMonth} ${endDay}, ${year} 22:00:00`);
    
    // If start date is after end date (e.g. Dec 15 to Jan 5), adjust year
    if (startDate > endDate) {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
    
    return { start: startDate.toISOString(), end: endDate.toISOString() };
  }

  const singleMatch = text.match(singleRegex);
  if (singleMatch) {
    const month = singleMatch[1];
    const day = singleMatch[2];
    const year = singleMatch[3];
    
    const startDate = new Date(`${month} ${day}, ${year} 19:30:00`);
    const endDate = new Date(`${month} ${day}, ${year} 22:00:00`);
    
    return { start: startDate.toISOString(), end: endDate.toISOString() };
  }

  return null;
}

export async function fetchGrandTheatreEvents(supabase: SupabaseClient): Promise<NormalizedEvent[]> {
  try {
    // 1. Fetch main directory page using Cache Engine
    const mainHtml = await fetchWithCache(`${BASE_URL}/events`, 'grand-theatre-main', supabase);
    
    // If null, it means 304 Not Modified OR Content Hash matched. No changes!
    if (!mainHtml) {
      console.log('[Grand Theatre] No changes detected. Skipping full scrape.');
      return [];
    }

    // 2. Parse event URLs
    const $ = cheerio.load(mainHtml);
    const eventUrls = new Set<string>();
    
    $('article a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('/event/')) {
        eventUrls.add(`${BASE_URL}${href}`);
      }
    });

    const events: NormalizedEvent[] = [];

    // 3. Fetch each event page in parallel (since we already know the directory changed, we must resync)
    // Vercel limit is 10s-60s, but Next.js fetch is fast. 15 requests in parallel is fine.
    const promises = Array.from(eventUrls).map(async (url) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'DTL-EventPipeline/2.0' } });
        if (!res.ok) return null;
        const html = await res.text();
        const $page = cheerio.load(html);

        const title = $page('h1').first().text().trim();
        const bodyText = $page('.field--name-body').text() || $page('body').text();
        const image = $page('meta[property="og:image"]').attr('content') || null;
        
        const dateParsed = parseDateRange(bodyText);
        if (!title || !dateParsed) return null;

        return {
          id: generateId('grand', url + dateParsed.start),
          name: title,
          venue_id: 'v-grand-theatre', // We need to add this to venues eventually
          start_time: dateParsed.start,
          best_link: url,
          dedup_hash: dedupHash('grand-theatre-scraper', url, dateParsed.start),
        } as NormalizedEvent;
      } catch (e) {
        console.error(`Error parsing Grand Theatre event ${url}:`, e);
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) events.push(r);
    }

    return events;
  } catch (err) {
    console.error('Grand Theatre scraping error:', err);
    return [];
  }
}
