import request from 'supertest';
import { apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import {
  getUserId,
  seedOfficeFile,
  seedTextFile,
  writePreviewPdfCache,
} from '../helpers/files.helper';

describe('Files Preview (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files/:id/preview 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/files/1/preview');
    expect(res.status).toBe(401);
  });

  it('GET /api/files/:id/preview-state 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/files/1/preview-state',
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/files/:id/preview-state 文件不存在应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .get('/api/files/999999999/preview-state')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/文件不存在/);
  });

  it('GET /api/files/:id/preview-state 非 Office 文件应返回 400', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'not office',
      `preview-txt-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/preview-state`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/无预览状态/);
  });

  it('GET /api/files/:id/preview-state Office 文件应返回状态 JSON', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedOfficeFile(
      app,
      userId,
      'office state',
      `preview-doc-${Date.now()}.docx`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/preview-state`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiMessage(res.body) as {
      success: boolean;
      phase: string;
      queueAvailable: boolean;
      jobs: {
        partial: { state: string };
        full: { state: string };
        partialMore: { state: string };
      };
    };
    expect(body.success).toBe(true);
    expect(body.phase).toMatch(/^(none|partial|full)$/);
    expect(typeof body.queueAvailable).toBe('boolean');
    expect(body.jobs.partial.state).toBeDefined();
    expect(body.jobs.full.state).toBeDefined();
    expect(body.jobs.partialMore.state).toBeDefined();
  });

  it('GET /api/files/:id/preview-status 应与 preview-state 响应一致', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedOfficeFile(
      app,
      userId,
      'office status alias',
      `preview-alias-${Date.now()}.docx`,
    );

    const [stateRes, statusRes] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/files/${userFile.id}/preview-state`)
        .set('Authorization', `Bearer ${accessToken}`),
      request(app.getHttpServer())
        .get(`/api/files/${userFile.id}/preview-status`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    expect(stateRes.status).toBe(200);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toEqual(stateRes.body);
  });

  it('GET /api/files/:id/preview 有全文缓存时应返回 application/pdf', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile, storage } = await seedOfficeFile(
      app,
      userId,
      'office preview pdf',
      `preview-pdf-${Date.now()}.docx`,
    );
    writePreviewPdfCache(storage.fileHash, 'full');

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/preview`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['x-preview-pdf-phase']).toBe('full');
    const pdfBody = Buffer.isBuffer(res.body)
      ? res.body
      : Buffer.from(String(res.text ?? ''), 'utf-8');
    expect(pdfBody.subarray(0, 4).toString('utf-8')).toBe('%PDF');
  });
});
