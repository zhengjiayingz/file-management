import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';

describe('UserPreference (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/user-preferences 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/user-preferences');
    expect(res.status).toBe(401);
  });

  it('GET /api/user-preferences 应返回默认配置', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .get('/api/user-preferences')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{ locale: string; theme: string }>(res.body);
    expect(body.data.locale).toBeDefined();
    expect(body.data.theme).toBeDefined();
  });

  it('PUT /api/user-preferences 应更新主题与语言', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .put('/api/user-preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locale: 'zh-CN', theme: 'dark' });

    expect(res.status).toBe(200);
    const body = apiBody<{ locale: string; theme: string }>(res.body);
    expect(body.data.locale).toBe('zh-CN');
    expect(body.data.theme).toBe('dark');
  });

  it('PUT /api/user-preferences 无效 locale 应返回 400', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .put('/api/user-preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locale: 'invalid-lang' });

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
  });
});
