import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import request from 'supertest';
import { apiBody, FileListItem } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId } from '../helpers/files.helper';
import { getUploadRootDir } from '@/files/utils/storagePath.utils';
import { PrismaService } from '@/prisma/prisma.service';

function md5(content: string | Buffer): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

describe('Files Upload (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/files/check-exists 无 Token 应返回 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/files/check-exists')
      .send({ fileHash: 'abc' });
    expect(res.status).toBe(401);
  });

  it('POST /api/files/check-exists 缺 fileHash 应返回 400', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .post('/api/files/check-exists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/files/check-exists 应返回 exists 状态', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const content = `instant-check-${Date.now()}`;
    const fileHash = md5(content);

    const miss = await request(app.getHttpServer())
      .post('/api/files/check-exists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileHash });
    expect(miss.status).toBe(200);
    expect(apiBody(miss.body).data.exists).toBe(false);

    const prisma = app.get(PrismaService);
    const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
      .trim()
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');
    await prisma.fileStorage.create({
      data: {
        fileHash,
        filePath: `${uploadRel}/e2e-${fileHash}.txt`,
        fileSize: BigInt(content.length),
        mimeType: 'text/plain',
        referenceCount: 1,
        status: 'active',
      },
    });

    const hit = await request(app.getHttpServer())
      .post('/api/files/check-exists')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileHash });
    expect(hit.status).toBe(200);
    expect(apiBody(hit.body).data.exists).toBe(true);
    expect(
      apiBody<{ exists: boolean; fileInfo?: { fileSize: number } }>(hit.body)
        .data.fileInfo?.fileSize,
    ).toBe(content.length);
  });

  it('POST /api/files/check-name 应返回顶层 exists 字段', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .post('/api/files/check-name')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fileName: `unique-${Date.now()}.txt` });
    expect(res.status).toBe(200);
    const checkBody = res.body as {
      success: boolean;
      exists: boolean;
      data?: unknown;
    };
    expect(checkBody.success).toBe(true);
    expect(checkBody.exists).toBe(false);
    expect(checkBody.data).toBeUndefined();
  });

  it('POST /api/files/upload-chunk + merge-chunks 应完成分片上传', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const content = Buffer.from(`chunk-e2e-${Date.now()}`);
    const fileHash = md5(content);
    const fileName = `chunk-${Date.now()}.txt`;
    const chunkHash = md5(content);

    const chunkRes = await request(app.getHttpServer())
      .post('/api/files/upload-chunk')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('fileHash', fileHash)
      .field('chunkIndex', '0')
      .field('chunkHash', chunkHash)
      .attach('chunk', content, 'chunk-0.bin');
    expect(chunkRes.status).toBe(200);
    expect(apiBody(chunkRes.body).success).toBe(true);

    const chunksList = await request(app.getHttpServer())
      .get(`/api/files/chunks/${fileHash}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(chunksList.status).toBe(200);
    expect(apiBody<number[]>(chunksList.body).data).toEqual([0]);

    const merge = await request(app.getHttpServer())
      .post('/api/files/merge-chunks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileHash,
        fileName,
        fileSize: content.length,
        mimeType: 'text/plain',
        totalChunks: 1,
      });
    expect(merge.status).toBe(201);
    const merged = apiBody<{
      id: number;
      fileName: string;
      fileSize: number;
    }>(merge.body);
    expect(merged.success).toBe(true);
    expect(merged.data.fileName).toBe(fileName);
    expect(merged.data.fileSize).toBe(content.length);

    const list = await request(app.getHttpServer())
      .get('/api/files')
      .set('Authorization', `Bearer ${accessToken}`);
    const ids = apiBody<FileListItem[]>(list.body).data.map((f) => f.id);
    expect(ids).toContain(merged.data.id);

    const prisma = app.get(PrismaService);
    const chunkRows = await prisma.uploadChunk.count({
      where: { fileHash, userId },
    });
    expect(chunkRows).toBe(0);
  });

  it('POST /api/files/instant-upload 无 FileStorage 应返回 404', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const res = await request(app.getHttpServer())
      .post('/api/files/instant-upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileHash: md5(`missing-${Date.now()}`),
        fileName: 'missing.txt',
        fileSize: 10,
        mimeType: 'text/plain',
      });
    expect(res.status).toBe(404);
  });

  it('POST /api/files/upload 应上传单文件', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const content = `%PDF-1.4 e2e ${Date.now()}`;
    const fileName = `e2e-upload-${Date.now()}.pdf`;

    const res = await request(app.getHttpServer())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(content, 'utf-8'), {
        filename: fileName,
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    const body = apiBody<{ id: number; fileName: string }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.fileName).toBe(fileName);

    const stored = path.join(getUploadRootDir(), `${md5(content)}-${fileName}`);
    expect(fs.existsSync(stored)).toBe(true);
  });

  it('POST /api/files/upload 应支持 .md 文件', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const content = `# E2E Markdown\n\nupload-md-${Date.now()}`;
    const fileName = `e2e-upload-${Date.now()}.md`;

    const res = await request(app.getHttpServer())
      .post('/api/files/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from(content, 'utf-8'), {
        filename: fileName,
        contentType: 'text/markdown',
      });

    expect(res.status).toBe(201);
    const body = apiBody<{ id: number; fileName: string; mimeType: string }>(
      res.body,
    );
    expect(body.success).toBe(true);
    expect(body.data.fileName).toBe(fileName);
    expect(body.data.mimeType).toMatch(/markdown|plain/);

    const stored = path.join(getUploadRootDir(), `${md5(content)}-${fileName}`);
    expect(fs.readFileSync(stored, 'utf-8')).toBe(content);
  });

  it('POST /api/files/folder 应创建文件夹；重名应 400', async () => {
    const { accessToken } = await loginAndGetTokens(app);
    const name = `folder-${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/api/files/folder')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name });
    expect(created.status).toBe(201);
    const body = apiBody<{ id: number; fileName: string; fileType: string }>(
      created.body,
    );
    expect(body.data.fileType).toBe('folder');
    expect(body.data.fileName).toBe(name);

    const dup = await request(app.getHttpServer())
      .post('/api/files/folder')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name });
    expect(dup.status).toBe(400);
  });
});
