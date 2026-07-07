import request from 'supertest';
import { apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedTextFile } from '../helpers/files.helper';

const MOCK_AI_STREAM_TEXT = 'mock-ai-stream-chunk';

describe('Files AI (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/files/:id/ai/ask 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/files/1/ai/ask');
    expect(res.status).toBe(401);
  });

  it('POST /api/files/:id/ai/ask 缺 question 应返回 400 JSON', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'ai body test',
      `ai-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/ai/ask`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ selectedText: 'some text' });

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/问题不能为空/);
  });

  it('POST /api/files/:id/ai/ask 文件不存在应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .post('/api/files/999999999/ai/ask')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        question: '这是什么？',
        selectedText: '片段内容',
      });

    expect(res.status).toBe(404);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/文件不存在/);
  });

  it('POST /api/files/:id/ai/ask 应返回 text/plain 流式响应', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `ai stream ${Date.now()}`;
    const { userFile } = await seedTextFile(
      app,
      userId,
      content,
      `ai-stream-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/ai/ask`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        question: '总结这段内容',
        selectedText: content,
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain(MOCK_AI_STREAM_TEXT);
  });
});
