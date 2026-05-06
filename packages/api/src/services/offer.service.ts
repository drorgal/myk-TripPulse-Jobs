import { prisma } from '@trippulse/db';
import { VEHICLE_TYPES } from '@trippulse/shared';

type VehicleType = (typeof VEHICLE_TYPES)[number];

interface OfferFilters {
  jobId?: string;
  vehicleType?: VehicleType;
  maxPrice?: number;
  sortBy?: 'price' | 'rentalDays';
  limit?: number;
  offset?: number;
}

export async function queryCarOffers(filters: OfferFilters) {
  const { jobId, vehicleType, maxPrice, sortBy = 'price', limit = 20, offset = 0 } = filters;

  const where = {
    ...(jobId !== undefined && { searchJobId: jobId }),
    ...(vehicleType !== undefined && { vehicleType }),
    ...(maxPrice !== undefined && { priceTotal: { lte: maxPrice } }),
  };

  const [offers, total] = await Promise.all([
    prisma.carOffer.findMany({
      where,
      orderBy: sortBy === 'price' ? { priceTotal: 'asc' } : { rentalDays: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.carOffer.count({ where }),
  ]);

  const jobStatus =
    jobId !== undefined
      ? (await prisma.searchJob.findUnique({ where: { id: jobId }, select: { status: true } }))
          ?.status
      : undefined;

  return {
    offers,
    total,
    jobStatus,
    pagination: { limit, offset, hasMore: offset + limit < total },
  };
}
