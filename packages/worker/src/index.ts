import { createLogger } from '@trippulse/shared';
import { startCarSearchWorker } from './workers/car-search.worker';

const logger = createLogger('worker-main');

async function main() {
  logger.info('TripPulse Jobs worker starting...');

  startCarSearchWorker();

  logger.info('Workers ready. Waiting for jobs...');
}

main().catch((err: unknown) => {
  console.error('Worker startup failed:', err);
  process.exit(1);
});
