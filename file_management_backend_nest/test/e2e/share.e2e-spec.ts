import request from 'supertest';
import { apiBody } from '../helpers/api-response';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { loginAndGetTokens } from '../helpers/auth.helper';
import { getUserId, seedTextFile } from '../helpers/files.helper';

describe('Share (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/shares 应创建分享', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'share-me',
      `share-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .post('/api/shares')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        userFileIds: [userFile.id],
        validity: '7d',
        extractMode: 'custom',
        customExtract: 'AB12',
      });

    expect(res.status).toBe(201);
    const body = apiBody<{
      shareCode: string;
      extractCode: string;
      userFileIds: number[];
    }>(res.body);
    expect(body.success).toBe(true);
    expect(body.data.shareCode).toBeTruthy();
    expect(body.data.extractCode).toBe('AB12');
    expect(body.data.userFileIds).toContain(userFile.id);
  });

  it('公开链接 GET meta + POST access 无需登录', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'public-share',
      `pub-${Date.now()}.txt`,
    );

    const created = await request(app.getHttpServer())
      .post('/api/shares')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        userFileIds: [userFile.id],
        extractMode: 'custom',
        customExtract: 'XY99',
      });
    const { shareCode } = apiBody<{ shareCode: string }>(created.body).data;

    const meta = await request(app.getHttpServer()).get(
      `/api/shares/public/${shareCode}`,
    );
    expect(meta.status).toBe(200);
    expect(meta.body.success).toBe(true);
    expect(meta.body.data.needExtract).toBe(true);

    const access = await request(app.getHttpServer())
      .post(`/api/shares/public/${shareCode}/access`)
      .send({ extractCode: 'XY99' });
    expect(access.status).toBe(200);
    expect(access.body.success).toBe(true);
    expect(access.body.data.files.length).toBe(1);
    expect(access.body.data.files[0].id).toBe(userFile.id);
  });

  it('GET /api/shares/mine 应列出我的分享', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'mine-list',
      `mine-${Date.now()}.txt`,
    );

    await request(app.getHttpServer())
      .post('/api/shares')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ userFileIds: [userFile.id], extractMode: 'custom', customExtract: 'ZZ11' });

    const list = await request(app.getHttpServer())
      .get('/api/shares/mine')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET access-logs 应返回访问记录', async () => {
    const { accessToken, username } = await loginAndGetTokens(app);
    const userId = await getUserId(app, username);
    const { userFile } = await seedTextFile(
      app,
      userId,
      'logs',
      `logs-${Date.now()}.txt`,
    );

    const created = await request(app.getHttpServer())
      .post('/api/shares')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        userFileIds: [userFile.id],
        extractMode: 'custom',
        customExtract: 'LG01',
      });
    const { shareCode, shareId } = apiBody<{
      shareCode: string;
      shareId: number;
    }>(created.body).data;

    await request(app.getHttpServer())
      .post(`/api/shares/public/${shareCode}/access`)
      .send({ extractCode: 'LG01' });

    const logs = await request(app.getHttpServer())
      .get(`/api/shares/${shareId}/access-logs`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logs.status).toBe(200);
    expect(logs.body.success).toBe(true);
    expect(logs.body.data.total).toBeGreaterThanOrEqual(1);
    expect(logs.body.data.list.length).toBeGreaterThanOrEqual(1);
  });
});
