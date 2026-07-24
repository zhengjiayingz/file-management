import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { apiBody } from '../helpers/api-response';
import { registerE2eUser } from '../helpers/social.helper';

describe('Operation Log (e2e)', () => {
  let app: E2eApp;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/logs returns paginated logs for current user', async () => {
    const user = await registerE2eUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/logs')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<unknown[]>(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it('GET /api/logs?transferOnly=true includes upload after file upload', async () => {
    const user = await registerE2eUser(app);
    const fileName = `log-e2e-${Date.now()}.pdf`;
    const upload = await request(app.getHttpServer())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4 log e2e', 'utf-8'), {
        filename: fileName,
        contentType: 'application/pdf',
      });
    expect(upload.status).toBe(201);

    const res = await request(app.getHttpServer())
      .get('/api/logs?transferOnly=true&limit=50')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    const body = apiBody<Array<{ operationType: string }>>(res.body);
    expect(body.data.some((l) => l.operationType === 'UPLOAD')).toBe(true);
  });
});
