import { Redis } from 'ioredis';

import { logger } from './logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
    return redis;
}

// 提供redis连接，进程启动时连上 Redis（失败时降级，不阻塞启动）
export async function connectRedis(): Promise<Redis | null> {
    const url = process.env.REDIS_URL;
    if (!url) {
        logger.info('[redis] REDIS_URL 未配置，跳过 Redis（限流/Socket Adapter 将降级）');
        return null;
    }
    if (redis) return redis;

    const client = new Redis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy: () => null,
        enableOfflineQueue: false,
    });

    client.on('error', (err) => {
        logger.warn({ err }, '[redis] 运行中连接异常');
    });

    try {
        await client.connect();
        await client.ping();
        redis = client;
        logger.info('[redis] Redis 连接成功');
        return client;
    } catch (err) {
        try {
            client.disconnect();
        } catch {
            // 清理失败可忽略
        }
        logger.warn({ err }, '[redis] 连接失败，以降级模式启动（限流/Socket 走内存）');
        return null;
    }
}

// 进程退出前调用关闭Redis
export async function disconnectRedis(): Promise<void> {
    if (!redis) return;
    await redis.quit();
    redis = null;
    logger.info('[redis] Redis 连接已关闭');
}

export default {
    getRedis,
    connectRedis,
    disconnectRedis,
};
