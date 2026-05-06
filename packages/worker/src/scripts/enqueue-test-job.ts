/**
 * Manual test script — not for production.
 *
 * Creates a SearchJob in PostgreSQL and enqueues it in BullMQ.
 * Use this to verify the full pipeline before the REST API (Phase 5) exists.
 *
 * Usage:
 *   cd packages/worker
 *   DATABASE_URL="postgresql://trippulse:localdev@localhost:5432/trippulse_jobs" \
 *   REDIS_PASSWORD=localdev \
 *   tsx src/scripts/enqueue-test-job.ts
 */

import { prisma } from '@trippulse/db';
import { carSearchQueue } from '../queues/car-search.queue';
import type { CarSearchJobPayload, CarSearchParams } from '@trippulse/shared';

const params: CarSearchParams = {
  pickupLocation: 'Rome Fiumicino Airport',
  dropoffLocation: 'Rome Fiumicino Airport',
  pickupDateTime: '2026-07-01T10:00:00.000Z',
  dropoffDateTime: '2026-07-08T10:00:00.000Z',
  currency: 'EUR',
  driverAge: 30,
};

async function main() {
  // Step 1: Create the DB record first — get a persistent, URL-safe ID
  const searchJob = await prisma.searchJob.create({
    data: {
      status: 'PENDING',
      // JSON round-trip converts the typed params to a plain JsonValue that Prisma accepts
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      params: JSON.parse(JSON.stringify(params)),
    },
  });

  // Step 2: Enqueue the BullMQ job, referencing the DB record by ID
  const bullJob = await carSearchQueue.add(
    'car-search',
    {
      searchJobId: searchJob.id,
      params,
      requestedAt: new Date().toISOString(),
    } satisfies CarSearchJobPayload,
    {
      jobId: searchJob.id, // Use the same ID for easy correlation
    },
  );

  // Step 3: Save the BullMQ job ID back to the DB for debugging
  await prisma.searchJob.update({
    where: { id: searchJob.id },
    data: { bullJobId: bullJob.id ?? null },
  });

  console.log(`✓ Created SearchJob:  ${searchJob.id}`);
  console.log(`✓ Enqueued BullMQ job: ${bullJob.id}`);
  console.log('');
  console.log('Watch the worker terminal for processing logs.');
  console.log('Then verify the result:');
  console.log(`  pnpm db:studio  →  localhost:5555`);
  console.log(`  SearchJob ${searchJob.id} should be COMPLETED with 3 CarOffer rows`);

  await prisma.$disconnect();
  // Close the queue connection so the process exits cleanly
  await carSearchQueue.close();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Script failed:', err);
  process.exit(1);
});
