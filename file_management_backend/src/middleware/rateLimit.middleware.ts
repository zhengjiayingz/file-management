import { rateLimit } from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import type { RequestHandler } from 'express'
import { getRedis } from '../lib/redis.js'

/** 15 分钟，可用环境变量覆盖 */
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const API_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 1 * 60 * 1000)

/** 同一 IP 窗口内最多请求次数，默认 10*/
const MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10)
const API_MAX = Number(process.env.API_RATE_LIMIT_MAX ?? 300)

function createLoginRateLimiter() {
    const redis = getRedis();
    let store: RedisStore | undefined;
    if (redis) {
        store = new RedisStore({
            prefix: 'rl:login',
            sendCommand: (command: string, ...args: string[]) =>
                redis.call(command, ...args) as Promise<RedisReply>,
        });
    } else {
        console.warn('[rate-limit] Redis 不可用，登录限流降级为内存 store（多实例不一致）');
    }
    return rateLimit({
        windowMs: WINDOW_MS,
        max: MAX,
        standardHeaders: true,
        legacyHeaders: false,
        store,          // 这里如果store传了undefined，rateLimit库内部用内存 store，不需要写 new MemoryStore()
        handler: (_req, res) => {
            res.status(429).json({
                success: false,
                code: 'RATE_LIMIT',
                message: '登录过于频繁，请稍后再试',
            });
        },
    });
}

function createApiRateLimiter() {
    const redis = getRedis();
    let store: RedisStore | undefined;
    if (redis) {
        store = new RedisStore({
            prefix: 'rl:api',
            sendCommand: (command: string, ...args: string[]) =>
                redis.call(command, ...args) as Promise<RedisReply>,
        });
    } else {
        console.warn('[rate-limit] Redis 不可用，api全局限流降级为内存 store（多实例不一致）');
    }
    return rateLimit({
        windowMs: API_WINDOW_MS,
        max: API_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        store,          // 这里如果store传了undefined，rateLimit库内部用内存 store，不需要写 new MemoryStore()
        handler: (_req, res) => {
            res.status(429).json({
                success: false,
                code: 'RATE_LIMIT',
                message: '请求尝试过于频繁，请稍后再试',
            });
        },
    });
}

let cached: ReturnType<typeof rateLimit> | null = null;
let apiCached: ReturnType<typeof rateLimit> | null = null;

function getLoginRateLimiterMiddleware() {
    if (!cached) {
        cached = createLoginRateLimiter()
    }
    return cached;
}

function getApiRateLimiterMiddleware() {
    if (!apiCached) {
        apiCached = createApiRateLimiter()
    }
    return apiCached;
}

/**
 * 仅用于 POST /api/auth/login。
 * 懒加载：首次请求时创建 limiter，此时 connectRedis() 应已完成。
 */
export const loginRateLimiter: RequestHandler = (req, res, next) => {
    return getLoginRateLimiterMiddleware()(req, res, next);
};
/**api请求限流 */
export const apiRateLimiter: RequestHandler = (req, res, next) => {
    return getApiRateLimiterMiddleware()(req, res, next);
};