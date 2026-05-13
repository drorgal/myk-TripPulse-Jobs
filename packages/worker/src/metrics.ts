import { createServer } from 'http';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { createLogger } from '@trippulse/shared';

const logger = createLogger('worker-metrics');

export const registry = new Registry();

// How long each car search job takes end-to-end (PROCESSING → COMPLETED/FAILED)
export const jobProcessingDurationMs = new Histogram({
  name: 'job_processing_duration_ms',
  help: 'Car search job processing duration in milliseconds',
  labelNames: ['status'] as const, // COMPLETED | PARTIAL | FAILED
  buckets: [100, 250, 500, 1000, 2000, 5000, 10000, 30000],
  registers: [registry],
});

// How long each provider call takes
export const providerCallDurationMs = new Histogram({
  name: 'provider_call_duration_ms',
  help: 'Provider search call duration in milliseconds',
  labelNames: ['provider'] as const,
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

// Provider call outcomes (success / failed)
export const providerCallsTotal = new Counter({
  name: 'provider_calls_total',
  help: 'Total provider search calls',
  labelNames: ['provider', 'result'] as const, // result: success | failed
  registers: [registry],
});

// How many jobs are currently being processed
export const jobsActive = new Gauge({
  name: 'jobs_active',
  help: 'Number of car search jobs currently being processed',
  registers: [registry],
});

// Total jobs completed, keyed by final status
export const jobsProcessedTotal = new Counter({
  name: 'jobs_processed_total',
  help: 'Total car search jobs processed by the worker',
  labelNames: ['status'] as const, // COMPLETED | PARTIAL | FAILED
  registers: [registry],
});

// ── Metrics HTTP server ───────────────────────────────────────────────────────
// Exposes /metrics on WORKER_METRICS_PORT (default 9091) so Prometheus can
// scrape the worker independently from the API.

export function startMetricsServer(): void {
  const port = parseInt(process.env['WORKER_METRICS_PORT'] ?? '9091', 10);

  const server = createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
    } else if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Worker metrics server listening');
  });
}
