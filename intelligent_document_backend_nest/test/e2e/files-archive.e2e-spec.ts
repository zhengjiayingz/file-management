import request from 'supertest';
import { apiBody } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedZipFile, setUserRole } from '../helpers/files.helper';

describe('Files Archive (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files/:id/archive/entries 普通用户应 403', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedZipFile(app, userId);

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/archive/entries`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it('GET /api/files/:id/archive/entries 管理员应列出 ZIP 条目', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    await setUserRole(app, userId, 'admin');
    const innerName = `inner-${Date.now()}.txt`;
    const { userFile } = await seedZipFile(
      app,
      userId,
      innerName,
      'archive-list-test',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/archive/entries`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{
      archiveName: string;
      entries: { path: string; isDirectory: boolean }[];
    }>(res.body);
    expect(body.data.archiveName).toMatch(/\.zip$/);
    const paths = body.data.entries.map((e) => e.path);
    expect(paths).toContain(innerName);
  });

  it('POST /api/files/:id/archive/conflicts 应检测重名', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    await setUserRole(app, userId, 'admin');
    const innerName = `conflict-${Date.now()}.txt`;
    const { userFile } = await seedZipFile(app, userId, innerName);

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/archive/conflicts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ parentId: null, paths: [innerName] });

    expect(res.status).toBe(200);
    const body = apiBody<{ hasConflict: boolean; conflictingPaths: string[] }>(
      res.body,
    );
    expect(body.data.hasConflict).toBe(false);
  });

  it('POST /api/files/:id/archive/extract 管理员应解压到网盘', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    await setUserRole(app, userId, 'admin');
    const innerName = `extract-${Date.now()}.txt`;
    const { userFile } = await seedZipFile(
      app,
      userId,
      innerName,
      'extract-content',
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/archive/extract`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ parentId: null, paths: [innerName], conflictAction: 'suffix' });

    expect(res.status).toBe(200);
    const body = apiBody<{ fileCount: number }>(res.body);
    expect(body.data.fileCount).toBe(1);

    const list = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    const names = apiBody<{ fileName: string }[]>(list.body).data.map(
      (f) => f.fileName,
    );
    expect(names).toContain(innerName);
  });
});
