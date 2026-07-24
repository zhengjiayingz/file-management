import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import {
  makeFriends,
  registerE2eUser,
} from '../helpers/social.helper';

describe('Friendship (e2e)', () => {
  let app: E2eApp;

  beforeEach(async () => {
    app = await createE2eApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /api/friendships/request 应发送好友请求', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);

    const res = await request(app.getHttpServer())
      .post('/api/friendships/request')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ friendId: userB.userId });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('好友请求发送成功');
    expect(res.body.friendship.status).toBe('pending');
  });

  it('PUT accept 后 GET /api/friendships 应列出好友', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    const list = await request(app.getHttpServer())
      .get('/api/friendships')
      .set('Authorization', `Bearer ${userA.accessToken}`);

    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const ids = list.body.map((f: { friendId: number }) => f.friendId);
    expect(ids).toContain(userB.userId);
  });

  it('GET /api/friendships/requests/pending 应返回待处理请求', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);

    await request(app.getHttpServer())
      .post('/api/friendships/request')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ friendUsername: userB.username });

    const pending = await request(app.getHttpServer())
      .get('/api/friendships/requests/pending')
      .set('Authorization', `Bearer ${userB.accessToken}`);

    expect(pending.status).toBe(200);
    expect(pending.body.length).toBeGreaterThanOrEqual(1);
    expect(pending.body[0].senderId).toBe(userA.userId);
  });

  it('DELETE /api/friendships/:friendId 应删除好友', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    const del = await request(app.getHttpServer())
      .delete(`/api/friendships/${userB.userId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`);

    expect(del.status).toBe(200);
    expect(del.body.message).toBe('已删除好友');

    const list = await request(app.getHttpServer())
      .get('/api/friendships')
      .set('Authorization', `Bearer ${userA.accessToken}`);
    const ids = list.body.map((f: { friendId: number }) => f.friendId);
    expect(ids).not.toContain(userB.userId);
  });
});
