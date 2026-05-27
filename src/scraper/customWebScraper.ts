import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function scrapeWebsiteForEvents(venueId: string, websiteUrl: string) {
  try {
    console.log(`[CustomWebScraper] Fetching HTML from ${websiteUrl} for venue ${venueId}...`);
    
    // 1. Fetch raw HTML
    const response = await fetch(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${websiteUrl}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // 2. Parse text with Cheerio
    const $ = cheerio.load(html);
    
    // Remove noisy elements
    $('script, style, noscript, iframe, img, svg, nav, footer, header').remove();
    
    // Extract clean text
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    
    // If text is incredibly long, we might need to truncate it for the LLM context limit
    const truncatedText = cleanText.substring(0, 15000); // ~15k chars is very safe
    
    console.log(`[CustomWebScraper] Extracted ${truncatedText.length} characters of raw text. Sending to local Gemma model on Llamabox...`);
    
    // 3. Use Local Llamabox (Gemma 4) to structure the unstructured text into JSON events
    // Defaulting to standard Ollama/Llamabox port 11434, but configurable via env
    const llamaboxEndpoint = process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/chat';
    const modelName = process.env.LOCAL_LLM_MODEL || 'gemma';
    
    const systemPrompt = `You are an expert web scraper. I am providing you with the raw text extracted from a live music venue or bar's website.
Your job is to read the text and extract any upcoming events, concerts, specials, or DJ nights.

Return a JSON array of event objects. Each object must have:
- "name": (string) The title of the event
- "description": (string) A short description
- "start_time": (string) An ISO 8601 timestamp. Guess the year based on the current date if not provided. Assume events are happening soon.
- "ticket_url": (string) Any URL mentioned for tickets, or null.

If you find NO upcoming events in the text, return exactly an empty array [].
Do not output markdown blocks or explanatory text. Output ONLY valid JSON.`;

    const userPrompt = `Raw Website Text:\n"""\n${truncatedText}\n"""`;

    const llmResponse = await fetch(llamaboxEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: 'json' // Force JSON mode if supported
      })
    });

    if (!llmResponse.ok) {
      throw new Error(`Llamabox error: ${llmResponse.statusText}`);
    }

    const result = await llmResponse.json();
    let eventsJson = result.message?.content || result.response || '[]';
    
    // Sanitize output just in case the model wraps it in markdown code blocks
    eventsJson = eventsJson.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let events = [];
    try {
      events = JSON.parse(eventsJson);
    } catch (err) {
      console.error(`[CustomWebScraper] Failed to parse Gemma JSON output: ${eventsJson}`);
      return;
    }
    
    console.log(`[CustomWebScraper] Gemma extracted ${events.length} events from ${websiteUrl}.`);
    
    // 4. Save to Database
    for (const event of events) {
      const { name, description, start_time, ticket_url } = event;
      
      // Calculate an approximate end time (e.g. 3 hours after start)
      const startDate = new Date(start_time);
      if (isNaN(startDate.getTime())) {
        console.warn(`[CustomWebScraper] Skipping event "${name}" due to invalid date: ${start_time}`);
        continue;
      }
      
      const endDate = new Date(startDate.getTime() + (3 * 60 * 60 * 1000));
      
      // Upsert by Name and Venue
      const { error } = await supabase.from('events').upsert({
        venue_id: venueId,
        name: name,
        description: description || '',
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'published',
        ticket_url: ticket_url || websiteUrl
      }, { onConflict: 'venue_id, name' });
      
      if (error) {
        console.error(`[CustomWebScraper] Supabase Upsert Error for event "${name}":`, error.message);
      }
    }
    
    console.log(`[CustomWebScraper] Successfully processed events for venue ${venueId}.`);
    
  } catch (error) {
    console.error(`[CustomWebScraper] Fatal error scraping ${websiteUrl}:`, error);
  }
}
