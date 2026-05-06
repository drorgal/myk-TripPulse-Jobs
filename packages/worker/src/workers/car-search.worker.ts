import { Worker } from 'bullmq';
import { QUEUE_NAMES, createLogger } from '@trippulse/shared';
import type { CarSearchJobPayload } from '@trippulse/shared';
import { redisConnection } from '../redis';
import { processCarSearch } from '../processors/car-search.processor';

const logger = createLogger('car-search-worker');

export function startCarSearchWorker() {
  const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '5', 10);

  const worker = new Worker<CarSearchJobPayload>(
    QUEUE_NAMES.CAR_SEARCH,
    async (job) => {
      logger.info(
        { jobId: job.id, searchJobId: job.data.searchJobId },
        'Processing car search job',
      );
      await job.updateProgress(10);
      await processCarSearch(job.data);
      await job.updateProgress(100);
    },
    {
      connection: redisConnection,
      // 5 jobs processed simultaneously — each spends most of its time waiting
      // for provider I/O, so high concurrency gives good throughput.
      concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, searchJobId: job.data.searchJobId }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, searchJobId: job?.data.searchJobId, err: err.message },
      'Job failed',
    );
  });

  // Graceful shutdown — wait for active jobs to finish before exiting.
  // Killing a worker mid-job leaves a SearchJob stuck in PROCESSING forever.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received — draining active jobs');
    await worker.close();
    logger.info('Worker closed cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.info({ concurrency }, 'Car search worker started');
  return worker;
}
