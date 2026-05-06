import express from 'express';
import { requestLogger } from './middleware/request-logger';
import { metricsMiddleware } from './middleware/metrics-middleware';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { jobsRouter } from './routes/jobs.router';
import { offersRouter } from './routes/offers.router';
import { checkHealth } from './health';
import { registry } from './metrics';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(requestLogger);
  app.use(metricsMiddleware);

  app.get('/health', (_req, res) => {
    void checkHealth().then((report) => {
      const httpStatus = report.status === 'ok' ? 200 : 503;
      res.status(httpStatus).json(report);
    });
  });

  app.get('/metrics', (_req, res) => {
    void registry.metrics().then((output) => {
      res.set('Content-Type', registry.contentType);
      res.end(output);
    });
  });

  app.use('/jobs', jobsRouter);
  app.use('/offers', offersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
