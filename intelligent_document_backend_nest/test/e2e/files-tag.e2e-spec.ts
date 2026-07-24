import request from 'supertest';
import { apiBody } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedTextFile } from '../helpers/files.helper';

describe('Files Tag (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/files/tags 应创建标签', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const tagName = `tag-${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post('/api/files/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagName, color: '#ff5500' });

    expect(res.status).toBe(201);
    const body = apiBody<{ id: number; tagName: string; color: string | null }>(
      res.body,
    );
    expect(body.data.tagName).toBe(tagName);
    expect(body.data.color).toBe('#ff5500');
  });

  it('PUT /api/files/:id/tags 应绑定文件标签', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'tag bind',
      `tag-bind-${Date.now()}.txt`,
    );

    const created = await request(app.getHttpServer())
      .post('/api/files/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagName: `bind-${Date.now()}` });
    const tagId = apiBody<{ id: number }>(created.body).data.id;

    const res = await request(app.getHttpServer())
      .put(`/api/files/${userFile.id}/tags`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagIds: [tagId] });

    expect(res.status).toBe(200);
    const body = apiBody<{ tags: { id: number }[] }>(res.body);
    expect(body.data.tags.map((t) => t.id)).toContain(tagId);
  });

  it('DELETE /api/files/tags/:tagId 应删除标签', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const created = await request(app.getHttpServer())
      .post('/api/files/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tagName: `del-${Date.now()}` });
    const tagId = apiBody<{ id: number }>(created.body).data.id;

    const del = await request(app.getHttpServer())
      .delete(`/api/files/tags/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);

    const list = await request(app.getHttpServer())
      .get('/api/files/tags')
      .set('Authorization', `Bearer ${accessToken}`);
    const ids = apiBody<{ id: number }[]>(list.body).data.map((t) => t.id);
    expect(ids).not.toContain(tagId);
  });
});
