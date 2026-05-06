import express from 'express';
import { requestLogger } from './middleware/request-logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { jobsRouter } from './routes/jobs.router';
import { offersRouter } from './routes/offers.router';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'trippulse-api' });
  });

  app.use('/jobs', jobsRouter);
  app.use('/offers', offersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
