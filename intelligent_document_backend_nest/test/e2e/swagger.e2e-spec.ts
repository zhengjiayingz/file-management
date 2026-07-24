import request from 'supertest';
import { createE2eApp, E2eApp } from '../helpers/app-bootstrap';

describe('Swagger (e2e)', () => {
  let app: E2eApp;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api-docs 应返回 Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/api-docs');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/swagger/i);
  });
});
