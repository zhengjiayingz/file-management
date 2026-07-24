import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/createApp.js'

describe('GET /health', () => {
    beforeAll(() => {
        // 测试未走 app.ts 的 connectRedis，去掉 REDIS_URL 避免误判为 down
        delete process.env.REDIS_URL;
    });

    it('返回 checks 结构；MySQL 可用时 200，否则 503', async () => {
        const app = createApp();
        const res = await request(app).get('/health');

        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('checks');
        expect(res.body.checks.redis).toBe('skipped');

        if (res.body.checks.mysql === 'up') {
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        } else {
            expect(res.status).toBe(503);
            expect(res.body.status).toBe('degraded');
        }
    });
});
