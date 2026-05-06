import { Queue, QueueEvents } from 'bullmq';
import { QUEUE_NAMES } from '@trippulse/shared';
import type { CarSearchJobPayload } from '@trippulse/shared';
import { redisConnection } from '../redis';

// Queue is used by BOTH the API (to add jobs) and the worker (to query state).
// Creating a Queue instance is lightweight — both processes create their own
// instance pointing at the same Redis keys. This is the standard BullMQ pattern.
export const carSearchQueue = new Queue<CarSearchJobPayload>(QUEUE_NAMES.CAR_SEARCH, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s → 4s → 8s between retries
    },
    removeOnComplete: {
      age: 60 * 60 * 24,    // Keep completed jobs in Redis for 24h (debugging)
      count: 1000,
    },
    removeOnFail: {
      age: 60 * 60 * 24 * 7, // Keep failed jobs for 7 days (investigation)
    },
  },
});

// QueueEvents emits real-time events: completed, failed, progress.
// The API uses this to check live job state without polling the DB.
export const carSearchQueueEvents = new QueueEvents(QUEUE_NAMES.CAR_SEARCH, {
  connection: redisConnection,
});
