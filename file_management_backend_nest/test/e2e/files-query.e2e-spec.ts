import request from 'supertest';
import { apiBody, FileListItem, TextChunkData } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedImageFile, seedTextFile, seedBinaryFile } from '../helpers/files.helper';
import { PrismaService } from '@/prisma/prisma.service';

describe('Files Query (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /api/files 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/files');
    expect(res.status).toBe(401);
  });

  it('GET /api/files 应返回 200 且 data 为数组', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<FileListItem[]>(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/files 应包含种子文件', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `e2e list ${Date.now()}`;
    const { userFile } = await seedTextFile(
      app,
      userId,
      content,
      `list-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const ids = apiBody<FileListItem[]>(res.body).data.map((f) => f.id);
    expect(ids).toContain(userFile.id);
  });

  it('GET /api/files/:id 应返回文件详情', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const fileName = `detail-${Date.now()}.txt`;
    const { userFile } = await seedTextFile(
      app,
      userId,
      'detail content',
      fileName,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<FileListItem>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(userFile.id);
    expect(body.data.fileName).toBe(fileName);
    expect(body.data.fileType).toBe('file');
  });

  it('GET /api/files/:id/download 应返回文件内容', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `download payload ${Date.now()}`;
    const { userFile } = await seedTextFile(
      app,
      userId,
      content,
      `dl-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(content);
  });

  it('GET /api/files/:id/download 应支持 Express 遗留路径 uploads/<name>', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `legacy express path ${Date.now()}`;
    const fileName = `legacy-${Date.now()}.txt`;
    const { userFile, storage } = await seedTextFile(
      app,
      userId,
      content,
      fileName,
    );

    const legacyName = storage.filePath.split('/').pop()!;
    const prisma = app.get(PrismaService);
    await prisma.fileStorage.update({
      where: { id: userFile.storageId! },
      data: { filePath: `uploads/${legacyName}` },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(content);
  });

  it('GET /api/files/:id/text-chunk 应返回分块文本', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = `text chunk hello ${Date.now()}`;
    const { userFile } = await seedTextFile(
      app,
      userId,
      content,
      `chunk-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/text-chunk`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<TextChunkData>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toContain('text chunk hello');
    expect(typeof body.data.totalSize).toBe('number');
    expect(body.data.done).toBe(true);
  });

  it('GET /api/files/:id/text-chunk 空文件应返回 done', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      '',
      `empty-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/text-chunk`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<TextChunkData>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('');
    expect(body.data.totalSize).toBe(0);
    expect(body.data.done).toBe(true);
  });

  it('GET /api/files/:id/thumbnail 应返回图片缩略图', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedImageFile(
      app,
      userId,
      `thumb-${Date.now()}.png`,
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/thumbnail`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\//);
    const buf = Buffer.isBuffer(res.body)
      ? res.body
      : Buffer.from(res.text || '', 'binary');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('POST /api/files/batch/download-zip 应返回 ZIP', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const f1 = await seedTextFile(app, userId, 'zip1', `z1-${Date.now()}.txt`);
    const f2 = await seedTextFile(app, userId, 'zip2', `z2-${Date.now()}.txt`);

    const res = await request(app.getHttpServer())
      .post('/api/files/batch/download-zip')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids: [f1.userFile.id, f2.userFile.id] })
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/zip|octet-stream/);
    const buf = Buffer.isBuffer(res.body)
      ? res.body
      : Buffer.from(res.text || '', 'binary');
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('GET /api/files/:id 不存在应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .get('/api/files/999999999')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('GET /api/files/tags 应返回 200 且 data 为数组（不得被 :id 路由误匹配）', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .get('/api/files/tags')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const body = apiBody<{ id: number; tagName: string }[]>(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/files/:id/download?preview=true 对 audio/ogg 应返回 audio/ogg 与 Accept-Ranges', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const payload = Buffer.alloc(4096, 0xab);
    const fileName = `audio-${Date.now()}.ogg`;
    const { userFile } = await seedBinaryFile(
      app,
      userId,
      payload,
      fileName,
      'audio/ogg',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/download`)
      .query({ preview: 'true' })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^audio\/ogg/);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe(String(payload.length));
  });

  it('GET /api/files/:id/download 应支持 Range 返回 206 Partial Content', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const payload = Buffer.from(`range-test-${Date.now()}`);
    const { userFile } = await seedBinaryFile(
      app,
      userId,
      payload,
      `range-${Date.now()}.ogg`,
      'audio/ogg',
    );

    const res = await request(app.getHttpServer())
      .get(`/api/files/${userFile.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Range', 'bytes=0-9');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toMatch(/bytes 0-9\/\d+/);
    expect(Buffer.isBuffer(res.body) ? res.body.length : res.text.length).toBe(10);
  });
});
