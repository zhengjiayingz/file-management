import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/createApp.js';
import type { Express } from 'express';

import {
  seedTestUser,
  loginAndGetToken,
  loginAndGetTokens,
  cleanupTestUsers,
} from './helpers/testAuth.js';

const TEST_USER = 'test_auth_user';
const app = createApp();

describe('认证 API', () => {
  afterEach(async () => {
    await cleanupTestUsers();
  });

  it('GET /api/auth/password-policy 返回 200', async () => {
    const res = await request(app).get('/api/auth/password-policy');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('GET /api/auth/me 无 Token 返回 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('未提供认证令牌');
  });

  it('POST /api/auth/login 密码错误返回 401', async () => {
    await seedTestUser(TEST_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_USER, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });



  it('登录成功后可用 accessToken 访问 /api/auth/me', async () => {
    await seedTestUser(TEST_USER);
    const accessToken = await loginAndGetToken(app as Express, TEST_USER);
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.username).toBe(TEST_USER);

  });



  it('GET /api/auth/me 无效 Token 返回 401', async () => {

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/refresh 可换新 accessToken', async () => {
    await seedTestUser(TEST_USER);
    const { refreshToken } = await loginAndGetTokens(app as Express, TEST_USER);
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeTruthy();

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.username).toBe(TEST_USER);
  });
});
