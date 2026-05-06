import request from 'supertest';
import { createApp } from '../app';

jest.mock('@trippulse/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([]),
    searchJob: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    carOffer: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock('../queue', () => ({
  carSearchQueue: {
    add: jest.fn(),
    getJobCounts: jest.fn().mockResolvedValue({}),
  },
}));

const app = createApp();

describe('GET /metrics', () => {
  it('returns 200 with Prometheus text format Content-Type', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('response body includes http_requests_total metric', async () => {
    // Make a request first so the counter has a value to report
    await request(app).get('/health');

    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_requests_total');
  });

  it('response body includes http_request_duration_ms metric', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('http_request_duration_ms');
  });
});
