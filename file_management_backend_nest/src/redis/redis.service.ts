import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.log('REDIS_URL 未配置，限流/Socket 将降级');
      return;
    }

    const client = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });

    client.on('error', (err) => {
      this.logger.warn(`Redis 连接异常: ${err.message}`);
    });

    try {
      await client.connect();
      await client.ping();
      this.client = client;
      this.logger.log('Redis 连接成功');
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
      this.logger.warn('Redis 连接失败，以降级模式运行');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<'up' | 'down' | 'skipped'> {
    if (!this.config.get<string>('REDIS_URL')) return 'skipped';
    if (!this.client) return 'down';
    try {
      const pong = await this.client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
