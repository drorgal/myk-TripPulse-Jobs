import request from 'supertest';
import { createApp } from '../app';

jest.mock('@trippulse/db', () => ({
  prisma: {
    searchJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../queue', () => ({
  carSearchQueue: {
    add: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@trippulse/db') as { prisma: Record<string, Record<string, jest.Mock>> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { carSearchQueue } = require('../queue') as { carSearchQueue: Record<string, jest.Mock> };

const app = createApp();

const validBody = {
  pickupLocation: 'Rome Fiumicino Airport',
  dropoffLocation: 'Rome Fiumicino Airport',
  pickupDateTime: '2026-07-01T10:00:00.000Z',
  dropoffDateTime: '2026-07-08T10:00:00.000Z',
  currency: 'EUR',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /jobs/car-search', () => {
  it('returns 202 with jobId and statusUrl when body is valid', async () => {
    const fakeJob = { id: 'job-123', status: 'PENDING' };
    prisma['searchJob']!['create']!.mockResolvedValueOnce(fakeJob);
    prisma['searchJob']!['update']!.mockResolvedValueOnce(fakeJob);
    carSearchQueue['add']!.mockResolvedValueOnce({ id: 'bull-123' });

    const res = await request(app).post('/jobs/car-search').send(validBody);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      jobId: 'job-123',
      status: 'PENDING',
      statusUrl: '/jobs/job-123',
      offersUrl: '/offers/cars?jobId=job-123',
    });
  });

  it('returns 400 when pickupLocation is missing', async () => {
    const { pickupLocation: _, ...body } = validBody;
    const res = await request(app).post('/jobs/car-search').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when pickupDateTime is not ISO 8601', async () => {
    const res = await request(app)
      .post('/jobs/car-search')
      .send({ ...validBody, pickupDateTime: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /jobs/:id', () => {
  it('returns 200 with job details and offerCount', async () => {
    prisma['searchJob']!['findUnique']!.mockResolvedValueOnce({
      id: 'job-123',
      status: 'COMPLETED',
      params: { pickupLocation: 'Rome' },
      providers: ['mock'],
      errorMessage: null,
      createdAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-01'),
      _count: { carOffers: 3 },
    });

    const res = await request(app).get('/jobs/job-123');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'job-123',
      status: 'COMPLETED',
      offerCount: 3,
    });
  });

  it('returns 404 when job does not exist', async () => {
    prisma['searchJob']!['findUnique']!.mockResolvedValueOnce(null);

    const res = await request(app).get('/jobs/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
