import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import { seedTextFile } from '../helpers/files.helper';
import {
  makeFriends,
  registerE2eUser,
} from '../helpers/social.helper';

describe('Message (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/messages 好友间应可发消息', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    const res = await request(app.getHttpServer())
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ receiverId: userB.userId, content: 'hello e2e' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('消息发送成功');
    expect(res.body.data.content).toBe('hello e2e');
  });

  it('非好友 POST /api/messages 应 403', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);

    const res = await request(app.getHttpServer())
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ receiverId: userB.userId, content: 'blocked' });

    expect(res.status).toBe(403);
  });

  it('GET /api/messages/:friendId 应返回聊天记录', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    await request(app.getHttpServer())
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ receiverId: userB.userId, content: 'history test' });

    const history = await request(app.getHttpServer())
      .get(`/api/messages/${userA.userId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`);

    expect(history.status).toBe(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body.some((m: { content: string }) => m.content === 'history test')).toBe(
      true,
    );
  });

  it('POST save-to-my-drive 应将好友分享文件转存到网盘', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    const { userFile } = await seedTextFile(
      app,
      userA.userId,
      'shared-content',
      `share-save-${Date.now()}.txt`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/files/${userFile.id}/save-to-my-drive`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .send({ parentId: null });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('成功存入您的网盘');
    expect(res.body.data.userId).toBe(userB.userId);
    expect(res.body.data.fileName).toContain('share-save');
  });

  it('PUT read + GET unread-summary 应标记已读', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    await request(app.getHttpServer())
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ receiverId: userB.userId, content: 'unread test' });

    const before = await request(app.getHttpServer())
      .get('/api/messages/unread-summary')
      .set('Authorization', `Bearer ${userB.accessToken}`);
    expect(before.body.some((g: { senderId: number }) => g.senderId === userA.userId)).toBe(
      true,
    );

    const read = await request(app.getHttpServer())
      .put(`/api/messages/${userA.userId}/read`)
      .set('Authorization', `Bearer ${userB.accessToken}`);
    expect(read.status).toBe(200);
    expect(read.body.updatedCount).toBeGreaterThanOrEqual(1);

    const after = await request(app.getHttpServer())
      .get('/api/messages/unread-summary')
      .set('Authorization', `Bearer ${userB.accessToken}`);
    const stillUnread = after.body.some(
      (g: { senderId: number }) => g.senderId === userA.userId,
    );
    expect(stillUnread).toBe(false);
  });
});
