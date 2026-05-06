import request from 'supertest';
import { createApp } from '../app';

jest.mock('@trippulse/db', () => ({
  prisma: {
    carOffer: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    searchJob: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../queue', () => ({
  carSearchQueue: { add: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@trippulse/db') as { prisma: Record<string, Record<string, jest.Mock>> };

const app = createApp();

const fakeOffer = {
  id: 'offer-1',
  searchJobId: 'job-123',
  providerName: 'mock',
  providerOfferId: 'mock-1',
  vehicleType: 'economy',
  vehicleName: 'Fiat 500',
  vehicleClass: 'economy',
  priceTotal: 31500,
  priceCurrency: 'EUR',
  pricePerDay: 4500,
  pickupLocation: 'Rome',
  dropoffLocation: 'Rome',
  pickupDateTime: new Date('2026-07-01'),
  dropoffDateTime: new Date('2026-07-08'),
  rentalDays: 7,
  hasAC: true,
  isAutomatic: true,
  createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /offers/cars', () => {
  it('returns 200 with offers array and pagination', async () => {
    prisma['carOffer']!['findMany']!.mockResolvedValueOnce([fakeOffer]);
    prisma['carOffer']!['count']!.mockResolvedValueOnce(1);
    prisma['searchJob']!['findUnique']!.mockResolvedValueOnce({ status: 'COMPLETED' });

    const res = await request(app).get('/offers/cars?jobId=job-123');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 1,
      jobStatus: 'COMPLETED',
      pagination: { limit: 20, offset: 0, hasMore: false },
    });
    expect(res.body.offers).toHaveLength(1);
  });

  it('filters by vehicleType', async () => {
    prisma['carOffer']!['findMany']!.mockResolvedValueOnce([fakeOffer]);
    prisma['carOffer']!['count']!.mockResolvedValueOnce(1);
    prisma['searchJob']!['findUnique']!.mockResolvedValueOnce({ status: 'COMPLETED' });

    const res = await request(app).get('/offers/cars?jobId=job-123&vehicleType=economy');

    expect(res.status).toBe(200);
    const callArgs = prisma['carOffer']!['findMany']!.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(callArgs.where).toMatchObject({ vehicleType: 'economy' });
  });

  it('filters by maxPrice', async () => {
    prisma['carOffer']!['findMany']!.mockResolvedValueOnce([fakeOffer]);
    prisma['carOffer']!['count']!.mockResolvedValueOnce(1);
    prisma['searchJob']!['findUnique']!.mockResolvedValueOnce({ status: 'COMPLETED' });

    const res = await request(app).get('/offers/cars?jobId=job-123&maxPrice=50000');

    expect(res.status).toBe(200);
    const callArgs = prisma['carOffer']!['findMany']!.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(callArgs.where).toMatchObject({ priceTotal: { lte: 50000 } });
  });

  it('returns 400 for invalid vehicleType', async () => {
    const res = await request(app).get('/offers/cars?vehicleType=spaceship');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
