import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

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

export function dedupHash(platform: string, sourceUrl: string, startTime: string): string {
  return createHash('sha256')
    .update(`${platform}|${sourceUrl}|${startTime}`)
    .digest('hex')
    .substring(0, 32);
}

export function generateId(prefix: string, seed: string): string {
  return `${prefix}-${createHash('sha256').update(seed).digest('hex').substring(0, 12)}`;
}

/**
 * Fetches HTML and uses ETag + Content Hash caching to abort parsing if nothing changed.
 * Returns the HTML string if parsing is needed, or null if the page hasn't changed.
 */
export async function fetchWithCache(url: string, sourceId: string, supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data: state } = await supabase
      .from('scraper_state')
      .select('etag, content_hash')
      .eq('id', sourceId)
      .single();

    const headers: Record<string, string> = { 'User-Agent': 'DTL-EventPipeline/2.0' };
    if (state?.etag) {
      headers['If-None-Match'] = state.etag;
    }

    const res = await fetch(url, { headers });
    
    if (res.status === 304) {
      console.log(`[Cache] 304 Not Modified for ${sourceId}`);
      return null;
    }

    if (!res.ok) return null;

    const html = await res.text();
    const newEtag = res.headers.get('etag');

    const cleanHtml = html.replace(/<input[^>]*type="hidden"[^>]*>/gi, '').replace(/<time[^>]*>.*?<\/time>/gi, '');
    const newHash = createHash('sha256').update(cleanHtml).digest('hex');

    if (state?.content_hash === newHash) {
      console.log(`[Cache] Content Hash matched for ${sourceId}`);
      await supabase.from('scraper_state').upsert({
        id: sourceId,
        etag: newEtag || state?.etag,
        content_hash: newHash,
        last_checked_at: new Date().toISOString()
      }, { onConflict: 'id' });
      
      return null;
    }

    console.log(`[Cache] MISS for ${sourceId}. Parsing new HTML...`);
    await supabase.from('scraper_state').upsert({
      id: sourceId,
      etag: newEtag,
      content_hash: newHash,
      last_checked_at: new Date().toISOString()
    }, { onConflict: 'id' });

    return html;
  } catch (err) {
    console.error(`Error in fetchWithCache for ${sourceId}:`, err);
    return null;
  }
}
