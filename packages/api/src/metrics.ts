import { Registry, Counter, Histogram } from 'prom-client';

export const registry = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [registry],
});

export const jobsCreatedTotal = new Counter({
  name: 'jobs_created_total',
  help: 'Total car search jobs created',
  labelNames: ['status'] as const,
  registers: [registry],
});
