import request from 'supertest';
import type { Express } from 'express';
import { expect } from 'vitest';
import prisma from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/services/passwordPolicy.service.js';

/** 满足默认密码策略的测试密码 */
export const DEFAULT_TEST_PASSWORD = 'TestPass1!';

/** 在测试库插入可登录用户（用户名建议以 test_ 开头） */
export async function seedTestUser(
  username: string,
  password: string = DEFAULT_TEST_PASSWORD,
): Promise<void> {
  await prisma.user.create({
    data: {
      username,
      password: hashPassword(password),
      storageQuota: BigInt(1073741824),
      role: 'user',
      status: 'active',
    },
  });
}

/** 登录并返回 accessToken */
export async function loginAndGetToken(
  app: Express,
  username: string,
  password: string = DEFAULT_TEST_PASSWORD,
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body.data.accessToken as string;
}

/** 登录并返回 accessToken 与 refreshToken */
export async function loginAndGetTokens(
  app: Express,
  username: string,
  password: string = DEFAULT_TEST_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);

  const { accessToken, refreshToken } = res.body.data;
  expect(accessToken).toBeTruthy();
  expect(refreshToken).toBeTruthy();

  return { accessToken, refreshToken };
}

/** 清理所有 test_ 前缀用户（afterEach 调用） */
export async function cleanupTestUsers(): Promise<void> {
  await prisma.user.deleteMany({
    where: { username: { startsWith: 'test_' } },
  });
}
