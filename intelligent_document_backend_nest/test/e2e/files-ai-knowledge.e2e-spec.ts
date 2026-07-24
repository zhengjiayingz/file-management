import request from 'supertest';
import { apiBody, apiMessage } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import {
  getUserId,
  seedDocumentKnowledge,
  seedReadyDocumentIndex,
  seedTextFile,
} from '../helpers/files.helper';

const PAPER_PAYLOAD = {
  title: 'Mock Paper',
  researchQuestion: 'How to test knowledge API?',
  contributions: ['Contribution A'],
  methodology: {
    approach: 'RAG + generateObject',
    dataset: null,
    metrics: ['coverage'],
  },
  keyFindings: [
    {
      claim: 'Finding A',
      evidence: null,
      section: 'results',
    },
  ],
  definitions: [],
  limitations: [],
  futureWork: [],
  keywords: ['mock'],
};

describe('Files AI Knowledge (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files/:id/ai/knowledge 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/files/1/ai/knowledge',
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/files/:id/ai/knowledge 文件不存在应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);

    const res = await request(app.getHttpServer())
      .get('/api/files/999999999/ai/knowledge')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(apiMessage(res.body).message).toMatch(/文件不存在/);
  });

  it('GET /api/files/:id/ai/knowledge 索引未完成应返回 409', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'knowledge pending',
      `knowledge-pending-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/knowledge`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(apiMessage(res.body).message).toMatch(/索引未完成/);
  });

  it('GET /api/files/:id/ai/knowledge general 体裁应返回 409', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'knowledge novel',
      `knowledge-novel-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(
      app,
      userFile.id,
      [{ content: 'chunk', embedding: [1, 0] }],
      { summaryGenre: 'novel' },
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/knowledge`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(apiMessage(res.body).message).toMatch(/仅学术体裁/);
  });

  it('GET /api/files/:id/ai/knowledge academic ready 但无卡片应返回 404', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'knowledge missing',
      `knowledge-missing-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(
      app,
      userFile.id,
      [{ content: 'chunk', embedding: [1, 0] }],
      { summaryGenre: 'paper' },
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/knowledge`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(apiMessage(res.body).message).toMatch(/知识卡片不存在/);
  });

  it('GET /api/files/:id/ai/knowledge paper 应返回 payload（含 section、dataset null）', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'knowledge paper',
      `knowledge-paper-${Date.now()}.txt`,
    );
    await seedReadyDocumentIndex(
      app,
      userFile.id,
      [{ content: 'chunk', embedding: [1, 0] }],
      { summaryGenre: 'paper' },
    );
    await seedDocumentKnowledge(app, userFile.id, PAPER_PAYLOAD);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/ai/knowledge`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(apiBody(res.body)).toMatchObject({
      success: true,
      data: {
        summaryGenre: 'paper',
        payload: {
          title: 'Mock Paper',
          contributions: ['Contribution A'],
          methodology: {
            approach: 'RAG + generateObject',
            dataset: null,
          },
          keyFindings: [
            {
              claim: 'Finding A',
              section: 'results',
            },
          ],
        },
      },
    });
  });
});
