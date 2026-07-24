import prisma from './prisma.js';
import { getRedis } from './redis.js';

export type CheckStatus = 'up' | 'down' | 'skipped';

export interface HealthResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: {
    mysql: CheckStatus;
    redis: CheckStatus;
  };
}

async function checkMysql(): Promise<CheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'up';
  } catch {
    return 'down';
  }
}

async function checkRedis(): Promise<CheckStatus> {
  if (!process.env.REDIS_URL) {
    return 'skipped';
  }

  const redis = getRedis();
  if (!redis) {
    return 'down';
  }

  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/** 探测 MySQL / Redis；必检项失败时 status 为 degraded */
export async function runHealthCheck(): Promise<HealthResult> {
  const [mysql, redis] = await Promise.all([checkMysql(), checkRedis()]);

  const checks = { mysql, redis };
  const requiredOk =
    checks.mysql === 'up' &&
    (checks.redis === 'up' || checks.redis === 'skipped');

  return {
    status: requiredOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  };
}
