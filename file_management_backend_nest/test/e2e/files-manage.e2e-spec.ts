import request from 'supertest';
import { apiBody, FileListItem } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedFolder, seedTextFile } from '../helpers/files.helper';

describe('Files Manage (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('DELETE /api/files/:id 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).delete('/api/files/1');
    expect(res.status).toBe(401);
  });

  it('DELETE /api/files/:id 应移入回收站', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'to delete',
      `del-${Date.now()}.txt`,
    );

    const del = await request(app.getHttpServer())
      .delete(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    expect(apiBody(del.body).success).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/files?isDeleted=true')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    const ids = apiBody<FileListItem[]>(list.body).data.map((f) => f.id);
    expect(ids).toContain(userFile.id);
  });

  it('POST /api/files/:id/restore 应从回收站还原', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'to restore',
      `rst-${Date.now()}.txt`,
    );

    await request(app.getHttpServer())
      .delete(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const restore = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(restore.status).toBe(200);
    expect(apiBody(restore.body).success).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    const ids = apiBody<FileListItem[]>(list.body).data.map((f) => f.id);
    expect(ids).toContain(userFile.id);
  });

  it('DELETE /api/files/:id/permanent 应永久删除', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'permanent',
      `perm-${Date.now()}.txt`,
    );

    await request(app.getHttpServer())
      .delete(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const perm = await request(app.getHttpServer())
      .delete(`/api/files/${userFile.id}/permanent`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(perm.status).toBe(200);
    expect(apiBody(perm.body).success).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.status).toBe(404);
  });

  it('PUT /api/files/:id/rename 应重命名', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'rename me',
      `old-${Date.now()}.txt`,
    );
    const newName = `renamed-${Date.now()}.txt`;

    const res = await request(app.getHttpServer())
      .put(`/api/files/${userFile.id}/rename`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: newName });
    expect(res.status).toBe(200);
    expect(apiBody(res.body).success).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(apiBody<FileListItem>(detail.body).data.fileName).toBe(newName);
  });

  it('PUT /api/files/:id/move 应移动到文件夹', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const folder = await seedFolder(app, userId, `folder-${Date.now()}`);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'move me',
      `mv-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .put(`/api/files/${userFile.id}/move`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ parentId: folder.id });
    expect(res.status).toBe(200);
    expect(apiBody(res.body).success).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(apiBody<FileListItem>(detail.body).data.parentId).toBe(folder.id);
  });

  it('PUT /api/files/:id/move parentId=0 应移动到根目录', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const folder = await seedFolder(app, userId, `root-folder-${Date.now()}`);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'to root',
      `root-${Date.now()}.txt`,
      folder.id,
    );

    const res = await request(app.getHttpServer())
      .put(`/api/files/${userFile.id}/move`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ parentId: 0 });
    expect(res.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(apiBody<FileListItem>(detail.body).data.parentId).toBeNull();
  });

  it('POST /api/files/batch/move 应批量移动', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const folder = await seedFolder(app, userId, `batch-folder-${Date.now()}`);
    const f1 = await seedTextFile(app, userId, 'bm1', `bm1-${Date.now()}.txt`);
    const f2 = await seedTextFile(app, userId, 'bm2', `bm2-${Date.now()}.txt`);
    const ids = [f1.userFile.id, f2.userFile.id];

    const res = await request(app.getHttpServer())
      .post('/api/files/batch/move')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids, parentId: folder.id });
    expect(res.status).toBe(200);
    expect(apiBody(res.body).success).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/api/files?parentId=${folder.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const movedIds = apiBody<FileListItem[]>(list.body).data.map((f) => f.id);
    expect(movedIds).toEqual(expect.arrayContaining(ids));
  });

  it('POST /api/files/batch/permanent-delete 应批量永久删除', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const f1 = await seedTextFile(app, userId, 'bp1', `bp1-${Date.now()}.txt`);
    const f2 = await seedTextFile(app, userId, 'bp2', `bp2-${Date.now()}.txt`);
    const ids = [f1.userFile.id, f2.userFile.id];

    await request(app.getHttpServer())
      .post('/api/files/batch/delete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids });

    const perm = await request(app.getHttpServer())
      .post('/api/files/batch/permanent-delete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids });
    expect(perm.status).toBe(200);
    expect(apiBody(perm.body).success).toBe(true);

    for (const id of ids) {
      const detail = await request(app.getHttpServer())
        .get(`/api/files/${id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(detail.status).toBe(404);
    }
  });

  it('POST /api/files/batch/delete 与 batch/restore 应批量操作', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const f1 = await seedTextFile(app, userId, 'b1', `b1-${Date.now()}.txt`);
    const f2 = await seedTextFile(app, userId, 'b2', `b2-${Date.now()}.txt`);
    const ids = [f1.userFile.id, f2.userFile.id];

    const del = await request(app.getHttpServer())
      .post('/api/files/batch/delete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids });
    expect(del.status).toBe(200);
    expect(apiBody(del.body).success).toBe(true);

    const recycle = await request(app.getHttpServer())
      .get('/api/files?isDeleted=true')
      .set('Authorization', `Bearer ${accessToken}`);
    const recycledIds = apiBody<FileListItem[]>(recycle.body).data.map(
      (f) => f.id,
    );
    expect(recycledIds).toEqual(expect.arrayContaining(ids));

    const restore = await request(app.getHttpServer())
      .post('/api/files/batch/restore')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids });
    expect(restore.status).toBe(200);
    expect(apiBody(restore.body).success).toBe(true);

    const list = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    const activeIds = apiBody<FileListItem[]>(list.body).data.map((f) => f.id);
    expect(activeIds).toEqual(expect.arrayContaining(ids));
  });
});
