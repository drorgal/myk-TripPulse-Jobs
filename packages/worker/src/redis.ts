import type { ConnectionOptions } from 'bullmq';

// BullMQ uses ioredis ConnectionOptions — not a URL string.
// Both the Queue (used by the API) and the Worker (used here) share this config.
// Each process creates its own connection; Redis handles multiplexing.
export const redisConnection: ConnectionOptions = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'] ?? 'localdev',
};
