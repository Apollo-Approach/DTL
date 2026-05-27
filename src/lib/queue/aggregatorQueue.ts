import { Queue } from 'bullmq';
import { connection } from './client';

// Define standard job interfaces
export interface IngestionJobData {
  source: 'ticketmaster' | 'eventbrite';
  timestamp: string;
}

// Global queue for all aggregation tasks
export const aggregatorQueue = new Queue<IngestionJobData, any, string>('EventAggregator', {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600, // keep for 1 hour
      count: 1000,
    },
    removeOnFail: {
      age: 24 * 3600, // keep for 24 hours
    },
  },
});
