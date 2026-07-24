import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { registerE2eAdmin } from '../helpers/admin.helper';
import { apiBody } from '../helpers/api-response';
import { registerE2eUser } from '../helpers/social.helper';

describe('Admin (e2e)', () => {
  let app: E2eApp;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/admin/dashboard returns 403 for normal user', async () => {
    const user = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/dashboard returns stats for admin', async () => {
    const admin = await registerE2eAdmin(app);
    const res = await request(app.getHttpServer())
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<{
      users: { total: number };
      storage: { totalUsed: string };
      files: { total: number };
    }>(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.users.total).toBe('number');
    expect(typeof body.data.storage.totalUsed).toBe('string');
  });

  it('GET /api/admin/users lists users for admin', async () => {
    const admin = await registerE2eAdmin(app);
    await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<Array<{ id: number; username: string }>>(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('PATCH /api/admin/users/:id/status disables another user', async () => {
    const admin = await registerE2eAdmin(app);
    const target = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .patch(`/api/admin/users/${target.userId}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'disabled' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/admin/system-settings returns config', async () => {
    const admin = await registerE2eAdmin(app);
    const res = await request(app.getHttpServer())
      .get('/api/admin/system-settings')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<{ passwordMinLength: number }>(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.passwordMinLength).toBe('number');
  });
});
