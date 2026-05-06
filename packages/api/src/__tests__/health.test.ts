import request from 'supertest';
import { createApp } from '../app';

jest.mock('@trippulse/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    searchJob: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    carOffer: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock('../queue', () => ({
  carSearchQueue: {
    add: jest.fn(),
    getJobCounts: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@trippulse/db') as { prisma: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { carSearchQueue } = require('../queue') as { carSearchQueue: Record<string, jest.Mock> };

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  prisma['$queryRaw']!.mockResolvedValue([{ '?column?': 1 }]);
  carSearchQueue['getJobCounts']!.mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 });
});

describe('GET /health', () => {
  it('returns 200 with status ok when DB and Redis are reachable', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db.status).toBe('ok');
    expect(res.body.redis.status).toBe('ok');
  });

  it('includes uptime and latencyMs fields', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(typeof res.body.db.latencyMs).toBe('number');
    expect(typeof res.body.redis.latencyMs).toBe('number');
  });

  it('returns 503 with status degraded when DB fails', async () => {
    prisma['$queryRaw']!.mockRejectedValueOnce(new Error("Can't reach database"));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db.status).toBe('error');
    expect(res.body.redis.status).toBe('ok');
  });

  it('returns 503 with status degraded when Redis fails', async () => {
    carSearchQueue['getJobCounts']!.mockRejectedValueOnce(new Error('Redis connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db.status).toBe('ok');
    expect(res.body.redis.status).toBe('error');
  });
});
