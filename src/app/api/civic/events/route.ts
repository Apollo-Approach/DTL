// src/app/api/civic/events/route.ts
// Fetches live event/concert data from the Ticketmaster Discovery API.
//
// The Ticketmaster API provides free access (5,000 calls/day) to event data
// including concerts, shows, and performances at London Ontario venues.
//
// API Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// Cost: $0 (free tier)
// Env: TICKETMASTER_API_KEY

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // Cache for 10 minutes — events don't change frequently

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

const TICKETMASTER_BASE = 'https://app.ticketmaster.com/discovery/v2';

// London Ontario approximate bounding box for geo-filtering
const LONDON_ON = {
  lat: '42.9849',
  lng: '-81.2453',
  radius: '30',   // 30km radius covers London metro
  unit: 'km'
};

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
    // Only future events
    startDateTime: new Date().toISOString().split('.')[0] + 'Z'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(`${TICKETMASTER_BASE}/events.json?${params}`, {
    signal: controller.signal,
    cache: 'no-store',
    headers: {
      'User-Agent': 'DTL-EventPipeline/1.0'
    }
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
    const venue = getVenueData(event);
    const dates = event.dates as Record<string, unknown> | undefined;
    const start = dates?.start as Record<string, unknown> | undefined;
    const priceRanges = event.priceRanges as Array<Record<string, unknown>> | undefined;
    const classifications = event.classifications as Array<Record<string, unknown>> | undefined;
    const images = event.images as Array<Record<string, unknown>> | undefined;
    const status = dates?.status as Record<string, unknown> | undefined;

    return {
      id: event.id as string,
      name: event.name as string,
      date: (start?.localDate as string) || '',
      time: (start?.localTime as string) || null,
      venue: venue.name,
      venueAddress: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      imageUrl: getBestImage(images || []),
      url: (event.url as string) || '',
      priceRange: formatPriceRange(priceRanges),
      genre: getClassification(classifications, 'genre'),
      subGenre: getClassification(classifications, 'subGenre'),
      status: (status?.code as string) || 'unknown',
      source: 'ticketmaster'
    };
  });
}

function getVenueData(event: Record<string, unknown>) {
  const embedded = event._embedded as Record<string, unknown> | undefined;
  const venues = embedded?.venues as Array<Record<string, unknown>> | undefined;
  const venue = venues?.[0];

  if (!venue) return { name: 'TBD', address: null, lat: null, lng: null };

  const location = venue.location as Record<string, unknown> | undefined;
  const address = venue.address as Record<string, unknown> | undefined;
  const city = venue.city as Record<string, unknown> | undefined;

  return {
    name: (venue.name as string) || 'TBD',
    address: address?.line1 
      ? `${address.line1}${city?.name ? `, ${city.name}` : ''}`
      : null,
    lat: location?.latitude ? parseFloat(location.latitude as string) : null,
    lng: location?.longitude ? parseFloat(location.longitude as string) : null
  };
}

function getBestImage(images: Array<Record<string, unknown>>): string | null {
  if (!images.length) return null;
  // Prefer 16:9 ratio, medium width
  const preferred = images.find(img => 
    (img.ratio === '16_9' || img.ratio === '3_2') && 
    (img.width as number) >= 300 && 
    (img.width as number) <= 800
  );
  return (preferred?.url || images[0]?.url || null) as string | null;
}

function formatPriceRange(ranges: Array<Record<string, unknown>> | undefined): string | null {
  if (!ranges?.length) return null;
  const range = ranges[0];
  const min = range.min as number;
  const max = range.max as number;
  const currency = (range.currency as string) || 'CAD';
  
  if (min === 0 && max === 0) return 'Free';
  if (min === max) return `$${min} ${currency}`;
  return `$${min} - $${max} ${currency}`;
}

function getClassification(
  classifications: Array<Record<string, unknown>> | undefined, 
  field: string
): string | null {
  if (!classifications?.length) return null;
  const cls = classifications[0];
  const value = cls[field] as Record<string, unknown> | undefined;
  return (value?.name as string) || null;
}

// Fallback: known London ON venues with upcoming events
// Used when Ticketmaster API key is not configured
function getKnownVenues(): EventData[] {
  return [
    {
      id: 'venue-budweiser-gardens',
      name: 'Check Budweiser Gardens for upcoming events',
      date: '',
      time: null,
      venue: 'Budweiser Gardens',
      venueAddress: '99 Dundas St, London, ON',
      lat: 42.9814,
      lng: -81.2530,
      imageUrl: null,
      url: 'https://www.budweisergardens.com/events',
      priceRange: null,
      genre: 'Venue',
      subGenre: null,
      status: 'info',
      source: 'manual'
    },
    {
      id: 'venue-london-music-hall',
      name: 'Check London Music Hall for upcoming shows',
      date: '',
      time: null,
      venue: 'London Music Hall',
      venueAddress: '185 Queens Ave, London, ON',
      lat: 42.9857,
      lng: -81.2489,
      imageUrl: null,
      url: 'https://londonmusichall.com',
      priceRange: null,
      genre: 'Venue',
      subGenre: null,
      status: 'info',
      source: 'manual'
    },
    {
      id: 'venue-aeolian-hall',
      name: 'Check Aeolian Hall for upcoming performances',
      date: '',
      time: null,
      venue: 'Aeolian Hall',
      venueAddress: '795 Dundas St, London, ON',
      lat: 42.9828,
      lng: -81.2253,
      imageUrl: null,
      url: 'https://aeolianhall.ca',
      priceRange: null,
      genre: 'Venue',
      subGenre: null,
      status: 'info',
      source: 'manual'
    }
  ];
}

export async function GET() {
  try {
    const apiKey = process.env.TICKETMASTER_API_KEY;

    let events: EventData[] = [];
    let source = 'fallback';

    if (apiKey) {
      events = await fetchTicketmasterEvents(apiKey);
      source = 'ticketmaster';
    }

    // If no events from Ticketmaster (no key or empty results), use venue fallback
    if (events.length === 0) {
      events = getKnownVenues();
      source = events.length > 0 ? 'venues-fallback' : 'none';
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
    
    // Always return venue fallbacks on error
    const fallback = getKnownVenues();
    return NextResponse.json({
      events: fallback,
      count: fallback.length,
      source: 'venues-fallback',
      error: 'Event feed degraded',
      lastUpdated: new Date().toISOString()
    });
  }
}
