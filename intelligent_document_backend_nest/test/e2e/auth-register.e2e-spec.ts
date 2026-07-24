import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';

describe('POST /api/auth/register (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('应返回 201 和 tokens', async () => {
    const username = `reg_${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: 'Test@1234', email: `${username}@test.com` });
    expect(res.status).toBe(201);
    const body = apiBody<{
      accessToken: string;
      refreshToken: string;
      user: { username: string };
    }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(body.data.user.username).toBe(username);
  });

  it('重复用户名应返回 400', async () => {
    const username = `dup_${Date.now()}`;
    const payload = { username, password: 'Test@1234' };
    await request(app.getHttpServer()).post('/api/auth/register').send(payload);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload);
    expect(res.status).toBe(400);
    expect(apiMessage(res.body).message).toBe('用户名已存在');
  });
});
