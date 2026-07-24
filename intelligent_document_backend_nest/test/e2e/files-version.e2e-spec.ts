import request from 'supertest';
import { apiBody } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import {
  getUserId,
  seedFileHistory,
  seedTextFile,
} from '../helpers/files.helper';

describe('Files Version (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files/:id/versions 无历史应返回空数组', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'v1',
      `ver-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<unknown[]>(res.body);
    expect(body.data).toEqual([]);
  });

  it('GET /api/files/:id/versions 应返回历史版本', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile, storage } = await seedTextFile(
      app,
      userId,
      'current',
      `ver-hist-${Date.now()}.txt`,
    );

    await seedFileHistory(app, userFile.id, storage.id, 1, 'old-name.txt', 100);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/versions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{ version: number; fileName: string }[]>(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].version).toBe(1);
    expect(body.data[0].fileName).toBe('old-name.txt');
  });

  it('POST /api/files/:id/versions/:versionId/rollback 应回滚版本', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile, storage } = await seedTextFile(
      app,
      userId,
      'current',
      `rollback-${Date.now()}.txt`,
    );

    const history = await seedFileHistory(
      app,
      userFile.id,
      storage.id,
      1,
      'rollback-old.txt',
      50,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/versions/${history.id}/rollback`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{ version: number }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.version).toBeGreaterThan(1);
  });

  it('GET /api/files/:id/versions/:versionId/download 应返回文件流', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `download-version-${Date.now()}`;
    const { userFile, storage } = await seedTextFile(
      app,
      userId,
      content,
      `dl-ver-${Date.now()}.txt`,
    );

    const history = await seedFileHistory(
      app,
      userFile.id,
      storage.id,
      1,
      'dl-old.txt',
      content.length,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/versions/${history.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain(content);
  });
});
