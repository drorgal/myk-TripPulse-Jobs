import { prisma } from '@trippulse/db';
import { createLogger } from '@trippulse/shared';
import type { CarSearchJobPayload } from '@trippulse/shared';
import { getCarRentalProviders } from '../providers/car-rental/registry';

const logger = createLogger('car-search-processor');

export async function processCarSearch(payload: CarSearchJobPayload): Promise<void> {
  const { searchJobId, params } = payload;

  await prisma.searchJob.update({
    where: { id: searchJobId },
    data: { status: 'PROCESSING' },
  });

  const providers = getCarRentalProviders(params.providers);
  logger.info(
    { searchJobId, providers: providers.map((p) => p.name) },
    'Fanning out to providers',
  );

  // allSettled — one provider failing must NOT fail the entire job.
  // If provider A fails and provider B succeeds, we still save B's results.
  const results = await Promise.allSettled(providers.map((p) => p.search(params)));

  let totalOffers = 0;
  const failedProviders: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const provider = providers[i]!;

    if (result.status === 'fulfilled') {
      const { offers } = result.value;

      if (offers.length > 0) {
        await prisma.carOffer.createMany({
          data: offers.map((offer) => ({
            searchJobId,
            providerName: offer.providerName,
            providerOfferId: offer.providerOfferId,
            vehicleType: offer.vehicleType,
            vehicleName: offer.vehicleName,
            vehicleClass: offer.vehicleClass,
            priceTotal: offer.priceTotal,
            priceCurrency: offer.priceCurrency,
            pricePerDay: offer.pricePerDay,
            pickupLocation: offer.pickupLocation,
            dropoffLocation: offer.dropoffLocation,
            // Prisma nullable fields require null, not undefined (exactOptionalPropertyTypes)
            pickupLat: offer.pickupLat ?? null,
            pickupLng: offer.pickupLng ?? null,
            dropoffLat: offer.dropoffLat ?? null,
            dropoffLng: offer.dropoffLng ?? null,
            pickupDateTime: new Date(offer.pickupDateTime),
            dropoffDateTime: new Date(offer.dropoffDateTime),
            rentalDays: offer.rentalDays,
            hasAC: offer.hasAC,
            isAutomatic: offer.isAutomatic,
            seatsCount: offer.seatsCount ?? null,
            bagCount: offer.bagCount ?? null,
            bookingUrl: offer.bookingUrl ?? null,
          })),
          // skipDuplicates makes this idempotent — safe to retry on worker crash.
          // The @@unique([searchJobId, providerName, providerOfferId]) constraint
          // ensures re-inserting the same offer silently succeeds.
          skipDuplicates: true,
        });
        totalOffers += offers.length;
      }
    } else {
      logger.warn(
        { searchJobId, providerName: provider.name, error: String(result.reason) },
        'Provider search failed',
      );
      failedProviders.push(provider.name);
    }
  }

  const allFailed = failedProviders.length === providers.length;
  const someFailed = failedProviders.length > 0 && !allFailed;
  const finalStatus = allFailed ? 'FAILED' : someFailed ? 'PARTIAL' : 'COMPLETED';

  await prisma.searchJob.update({
    where: { id: searchJobId },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      providers: providers.map((p) => p.name),
      errorMessage:
        failedProviders.length > 0 ? `Providers failed: ${failedProviders.join(', ')}` : null,
    },
  });

  logger.info({ searchJobId, finalStatus, totalOffers }, 'Car search processing complete');

  if (allFailed) {
    // Throwing causes BullMQ to mark this job as FAILED and schedule a retry
    // according to the backoff config (2s → 4s → 8s, up to 3 attempts).
    throw new Error(`All providers failed for job ${searchJobId}`);
  }
}
