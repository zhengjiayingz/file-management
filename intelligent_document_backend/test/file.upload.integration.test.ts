import { describe, it, expect, afterEach } from 'vitest';

import request from 'supertest';

import { createApp } from '../src/createApp.js';
import type { Express } from 'express';

import {
    seedTestUser,
    loginAndGetToken,
    cleanupTestUsers,
} from './helpers/testAuth.js';



const TEST_USER = 'test_upload_user';

const app = createApp();

describe('文件上传 API', () => {
    afterEach(async () => {
        await cleanupTestUsers();
    });

    it('POST /api/files/upload 无 Token 返回 401', async () => {

        const res = await request(app)
            .post('/api/files/upload')
            .attach('file', Buffer.from('x'), {
                filename: 'a.pdf',
                contentType: 'application/pdf',
            });
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('未提供认证令牌');

    });

    it('POST /api/files/upload 带 Token 小文件返回 201', async () => {
        await seedTestUser(TEST_USER);
        const token = await loginAndGetToken(app as Express, TEST_USER);
        const content = Buffer.from(`hello-${Date.now()}`);
        const res = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', content, {
                filename: 'test-upload.pdf',
                contentType: 'application/pdf',
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe('文件上传成功');
        expect(res.body.data.id).toBeTruthy();
        expect(res.body.data.fileName).toBe('test-upload.pdf');
        expect(res.body.data.fileSize).toBe(content.length);
        expect(res.body.data.mimeType).toBe('application/pdf');
    });
});
