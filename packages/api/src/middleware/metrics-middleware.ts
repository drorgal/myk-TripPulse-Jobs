import type { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDurationMs } from '../metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const t0 = Date.now();

  res.on('finish', () => {
    // Use the matched route pattern (/jobs/:id) not the raw URL (/jobs/cmo123...)
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, Date.now() - t0);
  });

  next();
}
