import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('User (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/user/profile 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/user/profile');
    expect(res.status).toBe(401);
  });

  it('GET /api/user/profile 应返回 mfa_setup_pending', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{
      username: string;
      mfa_setup_pending: boolean;
      totp_enabled: boolean;
    }>(res.body);
    expect(body.data.username).toBeDefined();
    expect(body.data).toHaveProperty('mfa_setup_pending');
    expect(body.data).toHaveProperty('totp_enabled');
  });

  it('PUT /api/user/profile 应更新邮箱', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const email = `user_${Date.now()}@example.com`;

    const res = await request(app.getHttpServer())
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email });

    expect(res.status).toBe(200);
    const body = apiBody<{ email: string | null }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(email);
    expect(body.message).toMatch(/更新成功/);
  });

  it('PUT /api/user/profile 无效邮箱应返回 400', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .put('/api/user/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/邮箱/);
  });

  it('POST /api/user/avatar 应上传头像', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .post('/api/user/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', PNG_1X1, {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    const body = apiBody<{ avatar_url: string }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.avatar_url).toMatch(/^\/uploads\/avatars\//);
  });

  it('GET /api/user/search 应按用户名搜索', async () => {
    const suffix = Date.now();
    const usernameA = `search_a_${suffix}`;
    const usernameB = `search_b_${suffix}`;
    const password = 'Test@1234';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username: usernameA, password });
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username: usernameB, password });

    const loginB = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: usernameB, password });
    const tokenB = apiBody<{ accessToken: string }>(loginB.body).data
      .accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/user/search')
      .query({ keyword: usernameA })
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    const body = apiBody<Array<{ username: string }>>(res.body);
    expect(body.data.some((u) => u.username === usernameA)).toBe(true);
    expect(body.data.some((u) => u.username === usernameB)).toBe(false);
  });
});
