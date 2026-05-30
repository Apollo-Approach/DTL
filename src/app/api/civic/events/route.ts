// src/app/api/civic/events/route.ts
// Fetches aggregated event data from ALL sources via the events table in Supabase.
// Sources include: Ticketmaster, Eventbrite, London Music Hall, Grand Theatre,
// Church Events, and LLM-synthesized venue events (trivia, open mic, etc.)
//
// Falls back to live Ticketmaster API if Supabase returns no events.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // Cache for 10 minutes

interface EventData {
  id: string;
  name: string;
  date: string;
  time: string | null;
  venue: string;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
  url: string;
  priceRange: string | null;
  genre: string | null;
  subGenre: string | null;
  status: string;
  source: string;
}

// ---- PRIMARY: Supabase Aggregated Events ----

async function fetchAggregatedEvents(): Promise<EventData[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not configured for events API');
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Query future events, join with venues for the name
  // To avoid filtering out events where end_time is null, we check that start_time is within the last 6 hours or future
  const cutoffTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id, name, start_time, end_time, is_free, price, categories,
      description, ticket_url, source_platform, source_url, image_url,
      age_restriction, door_time, venue_subroom, location,
      venues ( name, address )
    `)
    .gte('start_time', cutoffTime)
    .order('start_time', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Supabase events query error:', error.message);
    return [];
  }

  if (!events || events.length === 0) return [];

  return events.map((event) => {
    const startDate = new Date(event.start_time);
    const venueData = event.venues as unknown as { name: string; address: string } | { name: string; address: string }[] | null;
    const venue = Array.isArray(venueData) ? venueData[0] : venueData;

    // Format categories into a genre string
    const cats = event.categories as string[] | null;
    const genre = cats && cats.length > 0
      ? cats[0].replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null;

    // Format price
    let priceRange: string | null = null;
    if (event.is_free) {
      priceRange = 'Free';
    } else if (event.price && Number(event.price) > 0) {
      priceRange = `$${Number(event.price).toFixed(1)} CAD`;
    }

    return {
      id: event.id,
      name: event.name,
      date: startDate.toISOString().split('T')[0], // YYYY-MM-DD
      time: startDate.toTimeString().slice(0, 5),   // HH:MM
      venue: venue?.name || event.venue_subroom || 'TBD',
      venueAddress: venue?.address || null,
      lat: null,  // We don't expose raw coords here
      lng: null,
      imageUrl: event.image_url || null,
      url: event.ticket_url || event.source_url || '',
      priceRange,
      genre,
      subGenre: event.venue_subroom || null,
      status: 'onsale',
      source: event.source_platform || 'unknown'
    };
  });
}

// ---- FALLBACK: Live Ticketmaster API ----

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';
const LONDON_ON = { lat: '42.9849', lng: '-81.2453', radius: '30', unit: 'km' };

async function fetchTicketmasterEvents(apiKey: string): Promise<EventData[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    city: 'London',
    stateCode: 'ON',
    countryCode: 'CA',
    latlong: `${LONDON_ON.lat},${LONDON_ON.lng}`,
    radius: LONDON_ON.radius,
    unit: LONDON_ON.unit,
    size: '50',
    sort: 'date,asc',
    startDateTime: new Date().toISOString().split('.')[0] + 'Z'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`, {
    signal: controller.signal,
    cache: 'no-store',
    headers: { 'User-Agent': 'DTL-EventPipeline/1.0' }
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    if (response.status === 429) {
      console.warn('Ticketmaster rate limit reached');
      return [];
    }
    throw new Error(`Ticketmaster API Error: ${response.status}`);
  }

  const data = await response.json();
  const events = data?._embedded?.events || [];

  return events.map((event: Record<string, unknown>) => {
    const embedded = event._embedded as Record<string, unknown> | undefined;
    const venues = embedded?.venues as Array<Record<string, unknown>> | undefined;
    const venue = venues?.[0];
    const venueName = (venue?.name as string) || 'TBD';
    const address = venue?.address as Record<string, unknown> | undefined;
    const city = venue?.city as Record<string, unknown> | undefined;
    const venueLocation = venue?.location as Record<string, unknown> | undefined;

    const dates = event.dates as Record<string, unknown> | undefined;
    const start = dates?.start as Record<string, unknown> | undefined;
    const priceRanges = event.priceRanges as Array<Record<string, unknown>> | undefined;
    const classifications = event.classifications as Array<Record<string, unknown>> | undefined;
    const images = event.images as Array<Record<string, unknown>> | undefined;
    const status = dates?.status as Record<string, unknown> | undefined;

    let priceRange: string | null = null;
    if (priceRanges?.length) {
      const r = priceRanges[0];
      const min = r.min as number;
      const max = r.max as number;
      const currency = (r.currency as string) || 'CAD';
      if (min === 0 && max === 0) priceRange = 'Free';
      else if (min === max) priceRange = `$${min} ${currency}`;
      else priceRange = `$${min} - $${max} ${currency}`;
    }

    // Get best image (16:9, medium width)
    let imageUrl: string | null = null;
    if (images?.length) {
      const preferred = images.find(img =>
        (img.ratio === '16_9' || img.ratio === '3_2') &&
        (img.width as number) >= 300 &&
        (img.width as number) <= 800
      );
      imageUrl = (preferred?.url || images[0]?.url || null) as string | null;
    }

    const genreObj = classifications?.[0]?.genre as Record<string, unknown> | undefined;

    return {
      id: event.id as string,
      name: event.name as string,
      date: (start?.localDate as string) || '',
      time: (start?.localTime as string) || null,
      venue: venueName,
      venueAddress: address?.line1
        ? `${address.line1}${city?.name ? `, ${city.name}` : ''}`
        : null,
      lat: venueLocation?.latitude ? parseFloat(venueLocation.latitude as string) : null,
      lng: venueLocation?.longitude ? parseFloat(venueLocation.longitude as string) : null,
      imageUrl,
      url: (event.url as string) || '',
      priceRange,
      genre: (genreObj?.name as string) || null,
      subGenre: null,
      status: (status?.code as string) || 'unknown',
      source: 'ticketmaster'
    };
  });
}

export async function GET() {
  try {
    // Primary: fetch from our aggregated DB
    let events = await fetchAggregatedEvents();
    let source = 'aggregated';

    // Fallback: if DB is empty, try Ticketmaster directly
    if (events.length === 0) {
      const apiKey = process.env.TICKETMASTER_API_KEY;
      if (apiKey) {
        events = await fetchTicketmasterEvents(apiKey);
        source = 'ticketmaster-fallback';
      }
    }

    if (events.length === 0) {
      source = 'none';
    }

    return NextResponse.json({
      events,
      count: events.length,
      source,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    const err = error as Error;
    console.error('Events API Error:', err.message);

    return NextResponse.json({
      events: [],
      count: 0,
      source: 'error',
      error: 'Event feed degraded',
      lastUpdated: new Date().toISOString()
    });
  }
}
