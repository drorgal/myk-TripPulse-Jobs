import { prisma } from '@trippulse/db';
import { carSearchQueue } from './queue';

interface ComponentStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  db: ComponentStatus;
  redis: ComponentStatus;
}

export async function checkHealth(): Promise<HealthReport> {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const allOk = db.status === 'ok' && redis.status === 'ok';
  return {
    status: allOk ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db,
    redis,
  };
}

async function checkDb(): Promise<ComponentStatus> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

async function checkRedis(): Promise<ComponentStatus> {
  const t0 = Date.now();
  try {
    // getJobCounts() makes real Redis calls — if it succeeds, Redis is reachable
    await carSearchQueue.getJobCounts();
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
