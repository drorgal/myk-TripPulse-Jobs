import { processCarSearch } from '../../processors/car-search.processor';
import { MockCarRentalProvider } from '../../providers/car-rental/mock.provider';
import type { CarSearchJobPayload } from '@trippulse/shared';

// Mock the registry so tests control exactly which providers run.
jest.mock('../../providers/car-rental/registry', () => ({
  getCarRentalProviders: jest.fn(),
}));

// Mock Prisma — no real database needed for processor unit tests.
jest.mock('@trippulse/db', () => ({
  prisma: {
    searchJob: {
      update: jest.fn().mockResolvedValue({}),
    },
    carOffer: {
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getCarRentalProviders } = require('../../providers/car-rental/registry') as {
  getCarRentalProviders: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@trippulse/db') as {
  prisma: {
    searchJob: { update: jest.Mock };
    carOffer: { createMany: jest.Mock };
  };
};

const PAYLOAD: CarSearchJobPayload = {
  searchJobId: 'job-test-123',
  params: {
    pickupLocation: 'Rome Fiumicino Airport',
    dropoffLocation: 'Rome Fiumicino Airport',
    pickupDateTime: '2026-07-01T10:00:00.000Z',
    dropoffDateTime: '2026-07-08T10:00:00.000Z',
    currency: 'EUR',
    driverAge: 30,
  },
  requestedAt: '2026-05-06T00:00:00.000Z',
};

const okProvider = new MockCarRentalProvider({ delayMs: 0 });
const failProvider = new MockCarRentalProvider({
  delayMs: 0,
  name: 'mock-fail',
  shouldFail: true,
  failureReason: 'Provider outage',
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: reset to empty so each test sets its own providers.
  getCarRentalProviders.mockReturnValue([okProvider]);
});

describe('processCarSearch — COMPLETED path', () => {
  beforeEach(() => {
    getCarRentalProviders.mockReturnValue([okProvider]);
  });

  it('sets status to PROCESSING immediately', async () => {
    await processCarSearch(PAYLOAD);
    const firstCall = prisma.searchJob.update.mock.calls[0]![0] as {
      data: { status: string };
    };
    expect(firstCall.data.status).toBe('PROCESSING');
  });

  it('calls createMany with skipDuplicates: true', async () => {
    await processCarSearch(PAYLOAD);
    const createManyCall = prisma.carOffer.createMany.mock.calls[0]![0] as {
      skipDuplicates: boolean;
    };
    expect(createManyCall.skipDuplicates).toBe(true);
  });

  it('sets final status to COMPLETED', async () => {
    await processCarSearch(PAYLOAD);
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { status: string };
      };
    expect(lastCall.data.status).toBe('COMPLETED');
  });

  it('sets completedAt on the final update', async () => {
    await processCarSearch(PAYLOAD);
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { completedAt: unknown };
      };
    expect(lastCall.data.completedAt).toBeInstanceOf(Date);
  });

  it('does NOT throw', async () => {
    await expect(processCarSearch(PAYLOAD)).resolves.toBeUndefined();
  });
});

describe('processCarSearch — PARTIAL path (one of two providers fails)', () => {
  beforeEach(() => {
    getCarRentalProviders.mockReturnValue([okProvider, failProvider]);
  });

  it('still saves offers from the successful provider', async () => {
    await processCarSearch(PAYLOAD);
    expect(prisma.carOffer.createMany).toHaveBeenCalledTimes(1);
  });

  it('sets final status to PARTIAL', async () => {
    await processCarSearch(PAYLOAD);
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { status: string };
      };
    expect(lastCall.data.status).toBe('PARTIAL');
  });

  it('sets errorMessage listing the failed provider', async () => {
    await processCarSearch(PAYLOAD);
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { errorMessage: string };
      };
    expect(lastCall.data.errorMessage).toContain('mock-fail');
  });

  it('does NOT throw — PARTIAL is a BullMQ success, not retried', async () => {
    await expect(processCarSearch(PAYLOAD)).resolves.toBeUndefined();
  });
});

describe('processCarSearch — FAILED path (all providers fail)', () => {
  beforeEach(() => {
    getCarRentalProviders.mockReturnValue([failProvider]);
  });

  it('sets final status to FAILED', async () => {
    await expect(processCarSearch(PAYLOAD)).rejects.toThrow();
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { status: string };
      };
    expect(lastCall.data.status).toBe('FAILED');
  });

  it('sets errorMessage listing the failed provider', async () => {
    await expect(processCarSearch(PAYLOAD)).rejects.toThrow();
    const lastCall =
      prisma.searchJob.update.mock.calls[prisma.searchJob.update.mock.calls.length - 1]![0] as {
        data: { errorMessage: string };
      };
    expect(lastCall.data.errorMessage).toContain('mock-fail');
  });

  it('THROWS an Error to signal BullMQ to retry the job', async () => {
    await expect(processCarSearch(PAYLOAD)).rejects.toThrow(/All providers failed/);
  });

  it('does NOT call createMany (no offers to save)', async () => {
    await expect(processCarSearch(PAYLOAD)).rejects.toThrow();
    expect(prisma.carOffer.createMany).not.toHaveBeenCalled();
  });
});
