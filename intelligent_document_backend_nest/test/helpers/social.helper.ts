import request from 'supertest';
import { apiBody } from './api-response';
import { E2eApp } from './app-bootstrap';
import { getUserId } from './files.helper';

const TEST_PASSWORD = 'Test@1234';

export interface E2eUser {
  accessToken: string;
  username: string;
  userId: number;
}

export async function registerE2eUser(
  app: E2eApp,
  username?: string,
): Promise<E2eUser> {
  const name =
    username ?? `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ username: name, password: TEST_PASSWORD });
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: name, password: TEST_PASSWORD });
  const body = apiBody<{ accessToken: string }>(login.body);
  const userId = await getUserId(app, name);
  return { accessToken: body.data.accessToken, username: name, userId };
}

export async function makeFriends(
  app: E2eApp,
  userA: E2eUser,
  userB: E2eUser,
): Promise<void> {
  const send = await request(app.getHttpServer())
    .post('/api/friendships/request')
    .set('Authorization', `Bearer ${userA.accessToken}`)
    .send({ friendId: userB.userId });
  expect(send.status).toBe(201);
  const requestId = send.body.friendship.id as number;

  const accept = await request(app.getHttpServer())
    .put(`/api/friendships/request/${requestId}/accept`)
    .set('Authorization', `Bearer ${userB.accessToken}`);
  expect(accept.status).toBe(200);
}
