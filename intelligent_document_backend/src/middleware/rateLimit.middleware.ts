import { rateLimit } from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import type { RequestHandler } from 'express'
import { getRedis } from '../lib/redis.js'
import { logger } from '../lib/logger.js'

/** 15 分钟，可用环境变量覆盖 */
const WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const API_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60 * 1000)

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
        logger.warn('[rate-limit] Redis 不可用，登录限流降级为内存 store（多实例不一致）');
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
        logger.warn('[rate-limit] Redis 不可用，api全局限流降级为内存 store（多实例不一致）');
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

let loginLimiter: ReturnType<typeof rateLimit> | null = null;
let apiLimiter: ReturnType<typeof rateLimit> | null = null;

/**
 * 在 createApp() 内、挂载路由前调用（app.ts 已 await connectRedis()）。
 * express-rate-limit v8 要求实例在应用初始化时创建，不能在首个请求里 lazy create。
 */
export function initRateLimiters(): void {
    if (!loginLimiter) {
        loginLimiter = createLoginRateLimiter();
    }
    if (!apiLimiter) {
        apiLimiter = createApiRateLimiter();
    }
}

/**
 * 仅用于 POST /api/auth/login。
 * 须在 createApp() 内先 initRateLimiters()（connectRedis 完成后）；
 * 原先懒加载会在 express-rate-limit v8 触发 ERR_ERL_CREATED_IN_REQUEST_HANDLER。
 */
export const loginRateLimiter: RequestHandler = (req, res, next) => {
    if (!loginLimiter) {
        return next(new Error('[rate-limit] 请先调用 initRateLimiters()'));
    }
    return loginLimiter(req, res, next);
};

/** api请求限流 */
export function getApiRateLimiter(): RequestHandler {
    if (!apiLimiter) {
        throw new Error('[rate-limit] 请先调用 initRateLimiters()');
    }
    return apiLimiter;
}
