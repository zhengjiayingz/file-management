import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { registerE2eAdmin } from '../helpers/admin.helper';
import { apiBody } from '../helpers/api-response';
import { registerE2eUser } from '../helpers/social.helper';
import { PrismaService } from '@/prisma/prisma.service';

describe('VIP (e2e)', () => {
  let app: E2eApp;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/vip/tier-config returns quota config', async () => {
    const user = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/vip/tier-config')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<{ storageQuotaUserBytes: string }>(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.data.storageQuotaUserBytes).toBe('string');
  });

  it('POST /api/vip/apply submits request for normal user', async () => {
    const user = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .post('/api/vip/apply')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/vip/apply rejects duplicate pending request', async () => {
    const user = await registerE2eUser(app);
    await request(app.getHttpServer())
      .post('/api/vip/apply')
      .set('Authorization', `Bearer ${user.accessToken}`);
    const res = await request(app.getHttpServer())
      .post('/api/vip/apply')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(400);
  });

  it('GET /api/vip/pending returns 403 for normal user', async () => {
    const user = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/vip/pending')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can approve VIP request', async () => {
    const admin = await registerE2eAdmin(app);
    const applicant = await registerE2eUser(app);
    const apply = await request(app.getHttpServer())
      .post('/api/vip/apply')
      .set('Authorization', `Bearer ${applicant.accessToken}`);
    expect(apply.status).toBe(200);

    const pending = await request(app.getHttpServer())
      .get('/api/vip/pending')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(pending.status).toBe(200);
    const rows = apiBody<Array<{ id: number; applicantId: number }>>(
      pending.body,
    );
    const row = rows.data.find((r) => r.applicantId === applicant.userId);
    expect(row).toBeDefined();

    const approve = await request(app.getHttpServer())
      .post(`/api/vip/requests/${row!.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(approve.status).toBe(200);

    const prisma = app.get(PrismaService);
    const updated = await prisma.user.findUnique({
      where: { id: applicant.userId },
      select: { role: true },
    });
    expect(updated?.role).toBe('vip');
  });
});
