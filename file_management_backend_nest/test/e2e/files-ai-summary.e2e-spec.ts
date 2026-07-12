import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import {
  getUserId,
  seedDocumentSummary,
  seedPdfFile,
  seedReadyDocumentIndex,
  seedTextFile,
} from '../helpers/files.helper';

const BOOK_PAYLOAD = {
  oneLiner: 'mock 一句话',
  overview: 'mock 概览',
  plotPoints: ['情节 A'],
  characters: [{ name: '张三', role: '主角' }],
};

describe('Files AI Summary (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files/:id/ai/summary 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/files/1/ai/summary',
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/files/:id/ai/summary 文件不存在应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .get('/api/files/999999999/ai/summary')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    const msgBody = apiMessage(res.body);
    expect(msgBody.message).toMatch(/文件不存在/);
  });

  it('GET /api/files/:id/ai/summary 索引未完成应返回 409', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'summary not ready',
      `summary-pending-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    const msgBody = apiMessage(res.body);
    expect(msgBody.message).toMatch(/索引未完成/);
  });

  it('GET /api/files/:id/ai/summary ready 但无摘要应返回 404', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'summary missing row',
      `summary-empty-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(app, userFile.id, [
      { content: 'chunk', embedding: [1, 0] },
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    const msgBody = apiMessage(res.body);
    expect(msgBody.message).toMatch(/摘要不存在/);
  });

  it('GET /api/files/:id/ai/summary type=book 应返回 payload', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'summary book',
      `summary-book-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(app, userFile.id, [
      { content: 'chunk', embedding: [1, 0] },
    ]);
    await seedDocumentSummary(app, userFile.id, BOOK_PAYLOAD);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary?type=book`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(apiBody(res.body)).toMatchObject({
      success: true,
      data: {
        type: 'book',
        refKey: 'book',
        summaryGenre: 'novel',
        payload: {
          oneLiner: 'mock 一句话',
          overview: 'mock 概览',
          plotPoints: ['情节 A'],
        },
      },
    });
  });

  it('GET /api/files/:id/ai/summary PDF 索引 ready 后应返回 payload', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedPdfFile(
      app,
      userId,
      undefined,
      `summary-pdf-${Date.now()}.pdf`,
    );
    await seedReadyDocumentIndex(app, userFile.id, [
      { content: 'pdf chunk', embedding: [1, 0] },
    ]);
    await seedDocumentSummary(app, userFile.id, BOOK_PAYLOAD);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary?type=book`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(apiBody(res.body)).toMatchObject({
      success: true,
      data: {
        type: 'book',
        refKey: 'book',
        summaryGenre: 'novel',
        payload: {
          oneLiner: 'mock 一句话',
          overview: 'mock 概览',
        },
      },
    });
  });

  it('GET /api/files/:id/ai/summary 二次请求仍读库返回一致', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'summary idempotent',
      `summary-idem-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(app, userFile.id, [
      { content: 'chunk', embedding: [1, 0] },
    ]);
    await seedDocumentSummary(app, userFile.id, BOOK_PAYLOAD);

    const first = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary`)
      .set('Authorization', `Bearer ${accessToken}`);
    const second = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/summary`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });
});
