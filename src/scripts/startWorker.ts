import { Worker, Job } from 'bullmq';
import { connection } from '../lib/queue/client';
import { IngestionJobData, aggregatorQueue } from '../lib/queue/aggregatorQueue';
import { createClient } from '@supabase/supabase-js';
import { fetchEventbriteHybrid } from '../lib/scrapers/eventbrite';
import { fetchTicketmasterEvents } from '../lib/scrapers/ticketmasterNode'; // We will create this

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🚀 Starting Event Aggregator Worker on Linuxlid...');

const worker = new Worker<IngestionJobData, any, string>(
  'EventAggregator',
  async (job: Job<IngestionJobData, any, string>) => {
    console.log(`[Worker] Processing job ${job.id} for source: ${job.data.source}`);
    
    let events: any[] = [];
    
    if (job.data.source === 'eventbrite') {
      events = await fetchEventbriteHybrid(supabase);
    } else if (job.data.source === 'ticketmaster') {
      const apiKey = process.env.TICKETMASTER_API_KEY;
      if (apiKey) {
        events = await fetchTicketmasterEvents(apiKey);
      } else {
        throw new Error('Missing TICKETMASTER_API_KEY');
      }
    }

    console.log(`[Worker] ${job.data.source} returned ${events.length} events. Upserting...`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const event of events) {
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
          if (error.code === '23505') {
            skipped++;
          } else {
            console.error(`[Worker] Upsert error for ${event.id}:`, error.message);
            errors++;
          }
        } else {
          inserted++;
        }
      } catch (err) {
        errors++;
      }
    }

    console.log(`[Worker] Job ${job.id} complete. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
  },
  {
    connection: connection as any,
    concurrency: 1, // Only process one job at a time to respect rate limits
    limiter: {
      max: 5,
      duration: 1000, // Max 5 jobs per second
    }
  }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err);
});

// Immediately schedule the jobs if the queue is empty
async function scheduleInitialJobs() {
  const counts = await aggregatorQueue.getJobCounts();
  if (counts.waiting === 0 && counts.active === 0) {
    console.log('🗓️ Scheduling nightly ingestion jobs...');
    
    // Schedule Eventbrite (Combination)
    await aggregatorQueue.add(
      'eventbrite-nightly',
      { source: 'eventbrite', timestamp: new Date().toISOString() },
      { repeat: { pattern: '0 2 * * *' } } // 2 AM every day
    );

    // Schedule Ticketmaster
    await aggregatorQueue.add(
      'ticketmaster-nightly',
      { source: 'ticketmaster', timestamp: new Date().toISOString() },
      { repeat: { pattern: '30 2 * * *' } } // 2:30 AM every day
    );
    
    // Also run them once right now for testing
    await aggregatorQueue.add('eventbrite-immediate', { source: 'eventbrite', timestamp: new Date().toISOString() });
    await aggregatorQueue.add('ticketmaster-immediate', { source: 'ticketmaster', timestamp: new Date().toISOString() });
  }
}

scheduleInitialJobs();
