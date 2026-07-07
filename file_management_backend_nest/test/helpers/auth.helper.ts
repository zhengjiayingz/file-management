import request from 'supertest';
import { apiBody } from './api-response';
import { E2eApp } from './app-bootstrap';

const TEST_PASSWORD = 'Test@1234';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function loginAndGetTokens(app: E2eApp) {
  const username = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ username, password: TEST_PASSWORD });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD });
  const body = apiBody<AuthTokens>(res.body);
  return {
    accessToken: body.data.accessToken,
    refreshToken: body.data.refreshToken,
    username,
  };
}
