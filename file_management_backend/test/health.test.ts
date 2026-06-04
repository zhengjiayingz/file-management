import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/createApp.js'

describe('GET /health', () => {
    it('返回 200 和 status ok', async () => {
        const app = createApp();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.database).toBe("MySQL")
        expect(res.body.message).toBe('File Management API is running');
    });
});