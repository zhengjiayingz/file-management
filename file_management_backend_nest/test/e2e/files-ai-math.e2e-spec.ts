import request from 'supertest';
import { apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import {
  getUserId,
  seedImageFile,
  seedTextFile,
} from '../helpers/files.helper';
import { MOCK_AI_STREAM_TEXT } from '../setup-e2e';

describe('Files AI solve-math (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  /** 无 Token 应拒绝 */
  it('POST /api/files/:id/ai/solve-math 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).post(
      '/api/files/1/ai/solve-math',
    );
    expect(res.status).toBe(401);
  });

  /** 缺 question 应 400 */
  it('POST /api/files/:id/ai/solve-math 缺 question 应返回 400', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedImageFile(
      app,
      userId,
      `math-body-${Date.now()}.png`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/ai/solve-math`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/问题/);
  });

  /** 非图片应 400 */
  it('POST /api/files/:id/ai/solve-math 非图片应返回 400', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'not an image',
      `math-txt-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/ai/solve-math`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ question: '请分步解答本题' });

    expect(res.status).toBe(400);
    const body = apiMessage(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/仅支持/);
  });

  /** 图片应走 mock 流式 text/plain */
  it('POST /api/files/:id/ai/solve-math 图片应返回 text/plain 流式响应', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedImageFile(
      app,
      userId,
      `math-stream-${Date.now()}.png`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/ai/solve-math`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ question: '请分步解答本题' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain(MOCK_AI_STREAM_TEXT);
  });
});
