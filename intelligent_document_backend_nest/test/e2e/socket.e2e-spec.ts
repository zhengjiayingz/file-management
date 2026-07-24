import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';
import {
  connectSocket,
  connectSocketExpectFailure,
  disconnectSocket,
  listenE2eApp,
  waitForSocketEvent,
} from '../helpers/realtime.helper';
import { makeFriends, registerE2eUser } from '../helpers/social.helper';

describe('Socket Gateway (e2e)', () => {
  let app: E2eApp;
  let port: number;

  jest.setTimeout(30000);

  beforeEach(async () => {
    app = await createE2eApp();
    port = await listenE2eApp(app);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('无 Token 握手应被拒绝', async () => {
    const err = await connectSocketExpectFailure(port, undefined);
    expect(err.message).toMatch(/认证|令牌/);
  });

  it('无效 Token 握手应被拒绝', async () => {
    const err = await connectSocketExpectFailure(port, 'not-a-valid-jwt');
    expect(err.message).toMatch(/认证|令牌|无效/);
  });

  it('合法 Token 应连接成功并加入 user 房间', async () => {
    const user = await registerE2eUser(app);
    const socket = await connectSocket(port, user.accessToken);
    expect(socket.connected).toBe(true);
    disconnectSocket(socket);
  });

  it('REST 发消息后接收方应收到 message:new', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);
    await makeFriends(app, userA, userB);

    const receiverSocket = await connectSocket(port, userB.accessToken);
    const eventPromise = waitForSocketEvent<{ message: { content: string } }>(
      receiverSocket,
      'message:new',
    );

    const res = await request(app.getHttpServer())
      .post('/api/messages')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ receiverId: userB.userId, content: 'socket push e2e' });
    expect(res.status).toBe(201);

    const payload = await eventPromise;
    expect(payload.message.content).toBe('socket push e2e');
    disconnectSocket(receiverSocket);
  });

  it('好友请求后对方应收到 friendship:sync', async () => {
    const userA = await registerE2eUser(app);
    const userB = await registerE2eUser(app);

    const receiverSocket = await connectSocket(port, userB.accessToken);
    const syncPromise = waitForSocketEvent<Record<string, never>>(
      receiverSocket,
      'friendship:sync',
    );

    const res = await request(app.getHttpServer())
      .post('/api/friendships/request')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ friendId: userB.userId });
    expect(res.status).toBe(201);

    await syncPromise;
    disconnectSocket(receiverSocket);
  });
});
