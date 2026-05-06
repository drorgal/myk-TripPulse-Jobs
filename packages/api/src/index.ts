import { createLogger } from '@trippulse/shared';
import { createApp } from './app';

const logger = createLogger('api');
const PORT = parseInt(process.env['API_PORT'] ?? '3000', 10);

const app = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'TripPulse API listening');
});
