import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@trippulse/shared';
import type { CarSearchJobPayload } from '@trippulse/shared';

const redisConnection: ConnectionOptions = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'] ?? 'localdev',
};

export const carSearchQueue = new Queue<CarSearchJobPayload>(QUEUE_NAMES.CAR_SEARCH, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
});
