import { Redis } from 'ioredis'

let redis: Redis | null = null;

export function getRedis(): Redis | null {
    return redis
}

// 提供redis连接，进程启动时连上 Redis
export async function connectRedis(): Promise<Redis | null> {
    const url = process.env.REDIS_URL;
    if (!url) {
        console.warn('[redis] REDIS_URL 未配置，跳过 Redis（限流/Socket Adapter 将降级）');
        return null;
    }
    if (redis) return redis;
    const client = new Redis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
    });

    await client.connect();
    await client.ping();

    redis = client;
    console.log('[redis] Redis 连接成功');
    return client;
}

// 进程退出前调用关闭Redis
export async function disconnectRedis(): Promise<void> {
    if (!redis) return;
    await redis.quit();
    redis = null;
    console.log('[redis] Redis 连接已关闭');
}

export default {
    getRedis,
    connectRedis,
    disconnectRedis,
}