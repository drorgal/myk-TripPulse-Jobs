import { CarOfferSchema, VEHICLE_TYPES } from '@trippulse/shared';
import type { CarSearchParams } from '@trippulse/shared';
import { MockCarRentalProvider } from '../../providers/car-rental/mock.provider';
import { getCarRentalProviders, getRegisteredProviderNames } from '../../providers/car-rental/registry';

const BASE_PARAMS: CarSearchParams = {
  pickupLocation: 'Rome Fiumicino Airport',
  dropoffLocation: 'Rome Fiumicino Airport',
  pickupDateTime: '2026-07-01T10:00:00.000Z',
  dropoffDateTime: '2026-07-08T10:00:00.000Z', // 7 days
  currency: 'EUR',
  driverAge: 30,
};

// delayMs: 0 — no setTimeout in tests, runs instantly
const provider = new MockCarRentalProvider({ delayMs: 0 });

describe('MockCarRentalProvider', () => {
  describe('ping()', () => {
    it('returns true', async () => {
      expect(await provider.ping()).toBe(true);
    });
  });

  describe('search()', () => {
    let result: Awaited<ReturnType<typeof provider.search>>;

    beforeAll(async () => {
      result = await provider.search(BASE_PARAMS);
    });

    it('returns exactly 3 offers', () => {
      expect(result.offers).toHaveLength(3);
    });

    it('sets providerName to "mock" on every offer', () => {
      for (const offer of result.offers) {
        expect(offer.providerName).toBe('mock');
      }
    });

    it('sets rawResponseCount equal to the number of offers', () => {
      expect(result.rawResponseCount).toBe(result.offers.length);
    });

    it('returns no errors for a valid search', () => {
      expect(result.errors).toHaveLength(0);
    });

    it('computes rentalDays correctly from the datetime range', () => {
      for (const offer of result.offers) {
        expect(offer.rentalDays).toBe(7);
      }
    });

    it('stores prices as integers (cents) — never floats', () => {
      for (const offer of result.offers) {
        expect(Number.isInteger(offer.priceTotal)).toBe(true);
        expect(Number.isInteger(offer.pricePerDay)).toBe(true);
      }
    });

    it('computes priceTotal as pricePerDay × rentalDays', () => {
      for (const offer of result.offers) {
        expect(offer.priceTotal).toBe(offer.pricePerDay * offer.rentalDays);
      }
    });

    it('uses the currency from params', () => {
      for (const offer of result.offers) {
        expect(offer.priceCurrency).toBe(BASE_PARAMS.currency);
      }
    });

    it('copies pickupLocation and dropoffLocation from params', () => {
      for (const offer of result.offers) {
        expect(offer.pickupLocation).toBe(BASE_PARAMS.pickupLocation);
        expect(offer.dropoffLocation).toBe(BASE_PARAMS.dropoffLocation);
      }
    });

    it('produces only valid vehicleType values', () => {
      for (const offer of result.offers) {
        expect(VEHICLE_TYPES).toContain(offer.vehicleType);
      }
    });

    it('returns all three vehicle tiers: economy, compact, suv', () => {
      const types = result.offers.map((o) => o.vehicleType);
      expect(types).toContain('economy');
      expect(types).toContain('compact');
      expect(types).toContain('suv');
    });

    it('gives each offer a unique providerOfferId', () => {
      const ids = result.offers.map((o) => o.providerOfferId);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('each offer passes Zod CarOfferSchema validation', () => {
      for (const offer of result.offers) {
        const parsed = CarOfferSchema.safeParse(offer);
        expect(parsed.success).toBe(true);
      }
    });
  });
});

describe('MockCarRentalProvider failure modes', () => {
  it('throws when shouldFail is true', async () => {
    const failing = new MockCarRentalProvider({ delayMs: 0, shouldFail: true });
    await expect(failing.search(BASE_PARAMS)).rejects.toThrow('Mock provider intentional failure');
  });

  it('uses failureReason as the error message', async () => {
    const failing = new MockCarRentalProvider({
      delayMs: 0,
      shouldFail: true,
      failureReason: 'Service unavailable',
    });
    await expect(failing.search(BASE_PARAMS)).rejects.toThrow('Service unavailable');
  });

  it('succeeds normally when shouldFail is false', async () => {
    const ok = new MockCarRentalProvider({ delayMs: 0, shouldFail: false });
    const result = await ok.search(BASE_PARAMS);
    expect(result.offers).toHaveLength(3);
  });

  it('uses custom name when provided', () => {
    const named = new MockCarRentalProvider({ name: 'mock-b' });
    expect(named.name).toBe('mock-b');
  });
});

describe('getCarRentalProviders (registry)', () => {
  it('returns all registered providers when called with no arguments', () => {
    const all = getCarRentalProviders();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('returns only the "mock" provider when requested by name', () => {
    const [p] = getCarRentalProviders(['mock']);
    expect(p).toBeDefined();
    expect(p?.name).toBe('mock');
  });

  it('throws a descriptive error for an unknown provider name', () => {
    expect(() => getCarRentalProviders(['nonexistent'])).toThrow(
      /Unknown car rental provider: "nonexistent"/,
    );
  });

  it('getRegisteredProviderNames includes "mock"', () => {
    expect(getRegisteredProviderNames()).toContain('mock');
  });
});
