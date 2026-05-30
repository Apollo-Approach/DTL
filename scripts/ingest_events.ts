import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as path from 'path';

dotenv.config({ path: '/home/badmin/Development/DTL/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: venues, error: venuesError } = await supabase.from('venues_public').select('*');
  if (venuesError) throw venuesError;

  const findVenue = (addressStr: string) => {
    // Try to match by name snippet
    const nameMatch = addressStr.split(',')[0].trim().toLowerCase().replace(/’/g, "'");
    const match = venues.find(v => {
      const dbName = v.name.toLowerCase().replace(/’/g, "'");
      return dbName.includes(nameMatch) || nameMatch.includes(dbName);
    });
    if (!match) {
      console.warn(`Could not find venue for: ${addressStr}`);
    }
    return match;
  };

  const parseDateTime = (dtStr: string, isEnd: boolean = false) => {
    // format: 2026-05-29 19:00 EDT
    if (dtStr.toLowerCase().includes('not stated') || dtStr.toLowerCase().includes('time not visible')) {
      return null;
    }
    // Simple replacement to get a parseable date. EDT is UTC-4
    const cleanStr = dtStr.replace(' EDT', ' -04:00').replace(' EST', ' -05:00');
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const oneoffRaw = fs.readFileSync('/tmp/events_oneoff.txt', 'utf8');
  const lines = oneoffRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Skip to data
  let startIdx = lines.findIndex(l => l.startsWith('Start\tEnd\tEvent'));
  if (startIdx === -1) throw new Error("Could not find start of one-off table");
  
  const oneoffLines = lines.slice(startIdx + 1);
  const eventsToInsert: any[] = [];

  for (const line of oneoffLines) {
    if (!line.includes('\t')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const [startRaw, endRaw, eventName, venueRaw, locationInVenue, priceRaw, typeRaw, ticketingRaw, sourcesRaw] = parts;

    const venue = findVenue(venueRaw);
    if (!venue) continue;

    let startTime = parseDateTime(startRaw);
    let endTime = parseDateTime(endRaw, true);
    
    if (!startTime) {
      // If we can't parse start, skip
      continue;
    }
    if (!endTime) {
      // Default to 3 hours later
      const d = new Date(startTime);
      d.setHours(d.getHours() + 3);
      endTime = d.toISOString();
    }

    const isFree = priceRaw.toLowerCase().includes('free') || priceRaw.toLowerCase().includes('no cover') || priceRaw.toLowerCase().includes('pay what you can');
    let price = 0;
    const priceMatch = priceRaw.match(/CA\$(\d+(\.\d+)?)/);
    if (priceMatch) {
      price = parseFloat(priceMatch[1]);
    }

    const catMap: Record<string, string> = {
      'Live music': 'LIVE_MUSIC',
      'Comedy': 'ARTS_THEATRE',
      'Trivia': 'DINING_DRINKS',
      'Club': 'DJ_CLUB',
      'DJ': 'DJ_CLUB',
      'Dance': 'DJ_CLUB',
      'Karaoke': 'DINING_DRINKS'
    };
    
    let category = 'COMMUNITY';
    for (const [k, v] of Object.entries(catMap)) {
      if (typeRaw.toLowerCase().includes(k.toLowerCase())) {
        category = v;
        break;
      }
    }

    eventsToInsert.push({
      id: crypto.randomUUID(),
      name: eventName,
      venue_id: venue.id,
      start_time: startTime,
      end_time: endTime,
      is_free: isFree,
      price: price,
      categories: [category],
      description: `Type: ${typeRaw}\nDetails: ${priceRaw}\nLocation: ${locationInVenue || 'Not specified'}\nSource: ${ticketingRaw || ''}`,
      location: `SRID=4326;POINT(${venue.lng} ${venue.lat})`,
      ticket_url: ticketingRaw?.toLowerCase().includes('eventbrite') ? 'https://eventbrite.ca' : null
    });
  }

  // Now parse recurring
  const recurRaw = fs.readFileSync('/tmp/events_recurring.txt', 'utf8');
  const rlines = recurRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let rstartIdx = rlines.findIndex(l => l.startsWith('Venue\tProgram\tTime'));
  
  if (rstartIdx !== -1) {
    const recurLines = rlines.slice(rstartIdx + 1);
    for (const line of recurLines) {
      if (!line.includes('\t')) continue;
      const parts = line.split('\t');
      if (parts.length < 6) continue;
      
      const [venueRaw, program, timeRaw, occurrencesRaw, priceRaw, typeRaw, sourcesRaw] = parts;
      const venue = findVenue(venueRaw);
      if (!venue) continue;

      let startHour = 20;
      let startMin = 0;
      let endHour = 23;
      let endMin = 0;

      const timeMatch = timeRaw.match(/(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/);
      if (timeMatch) {
        startHour = parseInt(timeMatch[1]);
        startMin = parseInt(timeMatch[2]);
        endHour = parseInt(timeMatch[3]);
        endMin = parseInt(timeMatch[4]);
        if (endHour < startHour) endHour += 24; // Handle past midnight simply by adding 24 to logic, but wait, Date parsing...
      } else if (timeRaw.includes('21:00')) { startHour = 21; }
        else if (timeRaw.includes('22:00')) { startHour = 22; }
        else if (timeRaw.includes('19:00')) { startHour = 19; }

      const isFree = priceRaw.toLowerCase().includes('free') || priceRaw.toLowerCase().includes('no cover') || priceRaw.toLowerCase().includes('not stated');
      let price = 0;
      const pMatch = priceRaw.match(/CA\$(\d+(\.\d+)?)/);
      if (pMatch) price = parseFloat(pMatch[1]);

      let category = 'COMMUNITY';
      if (typeRaw.toLowerCase().includes('live music')) category = 'LIVE_MUSIC';
      else if (typeRaw.toLowerCase().includes('karaoke')) category = 'DINING_DRINKS';
      else if (typeRaw.toLowerCase().includes('trivia')) category = 'DINING_DRINKS';
      else if (typeRaw.toLowerCase().includes('comedy')) category = 'ARTS_THEATRE';
      else if (typeRaw.toLowerCase().includes('dj') || typeRaw.toLowerCase().includes('dance')) category = 'DJ_CLUB';

      // occurrences format: "May 31; Jun 7, 14, 21, 28; Jul 5, 12, 19, 26; Aug 2, 9, 16, 23"
      const months = occurrencesRaw.split(';');
      for (const monthChunk of months) {
        const mparts = monthChunk.trim().split(' ');
        if (mparts.length < 2) continue;
        const monthName = mparts[0];
        const days = mparts.slice(1).join('').split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));

        const monthMap: Record<string, number> = { 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7 };
        const mIdx = monthMap[monthName];
        if (mIdx === undefined) continue;

        for (const day of days) {
          const startDate = new Date(2026, mIdx, day, startHour, startMin, 0);
          const endDate = new Date(2026, mIdx, day, startHour, startMin, 0);
          
          if (timeMatch) {
            let actualEndHour = endHour;
            if (endHour >= 24) {
              actualEndHour = endHour - 24;
              endDate.setDate(endDate.getDate() + 1);
            }
            endDate.setHours(actualEndHour, endMin, 0);
          } else {
            endDate.setHours(startHour + 3, startMin, 0);
          }

          // Convert to UTC by treating the local Date creation as local EDT, wait, Node runs in system time. 
          // If system is UTC, this will be wrong. 
          // Best to construct string and parse with -04:00
          const mStr = (mIdx + 1).toString().padStart(2, '0');
          const dStr = day.toString().padStart(2, '0');
          const shStr = startHour.toString().padStart(2, '0');
          const smStr = startMin.toString().padStart(2, '0');
          
          const startStr = `2026-${mStr}-${dStr}T${shStr}:${smStr}:00-04:00`;
          
          let actualEndHour = endHour;
          let endDay = day;
          if (actualEndHour >= 24) {
            actualEndHour -= 24;
            // Simplified day increment assuming no month bounds crossed in this exact dataset, 
            // but wait, Jun 30 + 1 = Jul 1. It's safer to use Date math.
          }
          
          const tzStart = new Date(startStr);
          const tzEnd = new Date(startStr);
          if (timeMatch) {
             const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
             tzEnd.setMinutes(tzEnd.getMinutes() + duration);
          } else {
             tzEnd.setHours(tzEnd.getHours() + 3);
          }

          eventsToInsert.push({
            id: crypto.randomUUID(),
            name: program,
            venue_id: venue.id,
            start_time: tzStart.toISOString(),
            end_time: tzEnd.toISOString(),
            is_free: isFree,
            price: price,
            categories: [category],
            description: `Type: ${typeRaw}\nDetails: ${priceRaw}`,
            location: `SRID=4326;POINT(${venue.lng} ${venue.lat})`,
            ticket_url: null
          });
        }
      }
    }
  }

  console.log(`Found ${eventsToInsert.length} events to insert.`);
  
  if (eventsToInsert.length > 0) {
    const { error } = await supabase.from('events').insert(eventsToInsert);
    if (error) {
      console.error('Failed to insert events', error);
    } else {
      console.log('Successfully inserted events!');
    }
  }
}

run().catch(console.error);
