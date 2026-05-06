import type { CarOffer, CarSearchParams } from '@trippulse/shared';
import type { CarRentalProvider } from './interface';
import type { ProviderResult } from '../shared/provider.interface';

interface MockProviderOptions {
  // Simulated network delay in ms. Pass 0 in tests for instant results.
  delayMs?: number;
}

export class MockCarRentalProvider implements CarRentalProvider {
  readonly name = 'mock';
  readonly version = '1.0';

  private readonly delayMs: number;
  // Static counter makes providerOfferId deterministic across calls —
  // easier to assert in tests than random IDs.
  private static callCount = 0;

  constructor(options: MockProviderOptions = {}) {
    this.delayMs = options.delayMs ?? 300;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async search(params: CarSearchParams): Promise<ProviderResult<CarOffer>> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    MockCarRentalProvider.callCount += 1;
    const callId = MockCarRentalProvider.callCount;

    const pickupDt = new Date(params.pickupDateTime);
    const dropoffDt = new Date(params.dropoffDateTime);
    const rentalDays = Math.ceil(
      (dropoffDt.getTime() - pickupDt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const offers: CarOffer[] = [
      this.buildOffer(params, callId, 1, {
        vehicleType: 'economy',
        vehicleName: 'Toyota Yaris or similar',
        vehicleClass: 'ECMR',
        pricePerDay: 4500, // €45.00/day in cents
        isAutomatic: false,
        seatsCount: 5,
        bagCount: 1,
        rentalDays,
      }),
      this.buildOffer(params, callId, 2, {
        vehicleType: 'compact',
        vehicleName: 'Volkswagen Golf or similar',
        vehicleClass: 'CDMR',
        pricePerDay: 6000, // €60.00/day in cents
        isAutomatic: true,
        seatsCount: 5,
        bagCount: 2,
        rentalDays,
      }),
      this.buildOffer(params, callId, 3, {
        vehicleType: 'suv',
        vehicleName: 'Hyundai Tucson or similar',
        vehicleClass: 'SFAR',
        pricePerDay: 8500, // €85.00/day in cents
        isAutomatic: true,
        seatsCount: 5,
        bagCount: 3,
        rentalDays,
      }),
    ];

    return {
      offers,
      providerName: this.name,
      rawResponseCount: offers.length,
      errors: [],
    };
  }

  private buildOffer(
    params: CarSearchParams,
    callId: number,
    offerIndex: number,
    vehicle: {
      vehicleType: CarOffer['vehicleType'];
      vehicleName: string;
      vehicleClass: string;
      pricePerDay: number;
      isAutomatic: boolean;
      seatsCount: number;
      bagCount: number;
      rentalDays: number;
    },
  ): CarOffer {
    const priceTotal = vehicle.pricePerDay * vehicle.rentalDays;

    return {
      id: '', // Set after DB insert
      providerName: this.name,
      providerOfferId: `mock-${callId}-${offerIndex}`,
      vehicleType: vehicle.vehicleType,
      vehicleName: vehicle.vehicleName,
      vehicleClass: vehicle.vehicleClass,
      priceTotal,
      priceCurrency: params.currency,
      pricePerDay: vehicle.pricePerDay,
      pickupLocation: params.pickupLocation,
      dropoffLocation: params.dropoffLocation,
      pickupDateTime: params.pickupDateTime,
      dropoffDateTime: params.dropoffDateTime,
      rentalDays: vehicle.rentalDays,
      hasAC: true,
      isAutomatic: vehicle.isAutomatic,
      seatsCount: vehicle.seatsCount,
      bagCount: vehicle.bagCount,
      bookingUrl: `https://example.com/book/${this.name}-${callId}-${offerIndex}`,
    };
  }
}
