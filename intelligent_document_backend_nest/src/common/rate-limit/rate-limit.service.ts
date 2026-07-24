import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { RedisService } from '@/redis/redis.service';

@Injectable()
export class RateLimitService implements OnModuleInit {
  private readonly logger = new Logger(RateLimitService.name);
  private loginLimiter: RateLimitRequestHandler | null = null;
  private apiLimiter: RateLimitRequestHandler | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.loginLimiter = this.createLoginLimiter();
    this.apiLimiter = this.createApiLimiter();
  }

  getLoginLimiter(): RateLimitRequestHandler {
    if (!this.loginLimiter)
      throw new Error('Login rate limiter not initialized');
    return this.loginLimiter;
  }

  getApiLimiter(): RateLimitRequestHandler {
    if (!this.apiLimiter) throw new Error('API rate limiter not initialized');
    return this.apiLimiter;
  }

  private createLoginLimiter(): RateLimitRequestHandler {
    const windowMs = Number(
      this.config.get('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    );
    const max = Number(this.config.get('LOGIN_RATE_LIMIT_MAX', 10));
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore('rl:login'),
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT',
          message: '登录过于频繁，请稍后再试',
        });
      },
    });
  }

  private createApiLimiter(): RateLimitRequestHandler {
    const windowMs = Number(
      this.config.get('API_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    );
    const max = Number(this.config.get('API_RATE_LIMIT_MAX', 300));
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createStore('rl:api'),
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          code: 'RATE_LIMIT',
          message: '请求尝试过于频繁，请稍后再试',
        });
      },
    });
  }

  private createStore(prefix: string): RedisStore | undefined {
    const redis = this.redisService.getClient();
    if (!redis) {
      this.logger.warn(`Redis 不可用，${prefix} 限流降级为内存 store`);
      return undefined;
    }
    return new RedisStore({
      prefix,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    });
  }
}
