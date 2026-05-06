import { prisma } from '@trippulse/db';
import { NotFoundError } from '@trippulse/shared';
import type { CarSearchParams } from '@trippulse/shared';
import { carSearchQueue } from '../queue';

export async function createCarSearchJob(params: CarSearchParams) {
  const searchJob = await prisma.searchJob.create({
    data: {
      status: 'PENDING',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      params: JSON.parse(JSON.stringify(params)),
    },
  });

  const bullJob = await carSearchQueue.add(
    'car-search',
    {
      searchJobId: searchJob.id,
      params,
      requestedAt: new Date().toISOString(),
    },
    { jobId: searchJob.id },
  );

  await prisma.searchJob.update({
    where: { id: searchJob.id },
    data: { bullJobId: bullJob.id ?? null },
  });

  return searchJob;
}

export async function getJobById(id: string) {
  const job = await prisma.searchJob.findUnique({
    where: { id },
    include: { _count: { select: { carOffers: true } } },
  });
  if (!job) throw new NotFoundError('SearchJob', id);
  return job;
}
