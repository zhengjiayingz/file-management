import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';

type CheckStatus = 'up' | 'down' | 'skipped';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const mysql = await this.checkMysql();
    const redisStatus = await this.redis.ping();

    const requiredOk =
      mysql === 'up' && (redisStatus === 'up' || redisStatus === 'skipped');
    return {
      status: requiredOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { mysql, redis: redisStatus },
      runtime: 'nest',
    };
  }

  private async checkMysql(): Promise<CheckStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
