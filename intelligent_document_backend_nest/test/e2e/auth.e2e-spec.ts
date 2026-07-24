import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';

describe('Auth (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('GET /api/auth/password-policy', () => {
    it('应返回策略', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/auth/password-policy',
      );
      expect(res.status).toBe(200);
      const body = apiBody<{ minLength: number }>(res.body);
      expect(body.success).toBe(true);
      expect(body.data.minLength).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    it('错误密码应返回 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nonexistent_xyz', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/mfa/verify', () => {
    it('无 token 应返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/mfa/verify')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('应返回当前用户', async () => {
      const { accessToken } = await loginAndGetTokens(app);
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      const body = apiBody<{
        username: string;
        totp_enabled: boolean;
        mfa_setup_pending: boolean;
      }>(res.body);
      expect(body.data.username).toBeDefined();
      expect(body.data).toHaveProperty('totp_enabled');
      expect(body.data).toHaveProperty('mfa_setup_pending');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('应修改密码并返回新 token', async () => {
      const username = `chgpw_${Date.now()}`;
      const password = 'Test@1234';
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ username, password });

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password });
      const loginBody = apiBody<{ accessToken: string }>(login.body);

      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
        .send({ currentPassword: password, newPassword: 'NewTest@5678' });

      expect(res.status).toBe(200);
      const body = apiBody<{
        accessToken: string;
        user: { must_change_password: boolean };
      }>(res.body);
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.user.must_change_password).toBe(false);
    });
  });

  describe('POST /api/auth/sessions/list', () => {
    it('应返回会话列表', async () => {
      const { accessToken, refreshToken } = await loginAndGetTokens(app);
      const res = await request(app.getHttpServer())
        .post('/api/auth/sessions/list')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(res.status).toBe(200);
      const body = apiBody<{ sessions: unknown[] }>(res.body);
      expect(Array.isArray(body.data.sessions)).toBe(true);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('应返回成功提示', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ username: 'nonexistent_user_xyz' });
      expect(res.status).toBe(200);
      expect(apiMessage(res.body).message).toBe('请等待管理员重置密码');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('无效 token 应返回 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('无 body 也应 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({});
      expect(res.status).toBe(200);
      expect(apiBody(res.body).success).toBe(true);
    });
  });
});
