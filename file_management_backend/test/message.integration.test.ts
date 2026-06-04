import type { Express } from 'express';
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/createApp.js';
import prisma from '../src/lib/prisma.js';
import {
  seedTestUser,
  loginAndGetToken,
  cleanupTestUsers,
} from './helpers/testAuth.js';

const TEST_ALICE = 'test_alice';
const TEST_BOB = 'test_bob';
const TEST_STRANGER = 'test_stranger';

const TEST_MESSAGE = 'hello from integration test';

const app = createApp();

/** 根据用户名查 id，发消息时 receiverId 要用数字 id */
async function getUserId(username: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`用户不存在: ${username}`);
  return user.id;
}

/** alice 与 bob 互为好友（accepted） */
async function seedFriendship(aliceId: number, bobId: number): Promise<void> {
  await prisma.friendship.create({
    data: {
      userId: aliceId,
      friendId: bobId,
      status: 'accepted',
    },
  });
}

describe('消息 API', () => {
  afterEach(async () => {
    await cleanupTestUsers();
  });

  it('M1: alice 登录后给 bob 发消息返回 201', async () => {
    await seedTestUser(TEST_ALICE);
    await seedTestUser(TEST_BOB);
    const aliceId = await getUserId(TEST_ALICE);
    const bobId = await getUserId(TEST_BOB);
    await seedFriendship(aliceId, bobId);

    const aliceToken = await loginAndGetToken(app as Express, TEST_ALICE);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        receiverId: bobId,
        content: TEST_MESSAGE,
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('消息发送成功');
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.content).toBe(TEST_MESSAGE);
    expect(res.body.data.senderId).toBe(aliceId);
    expect(res.body.data.receiverId).toBe(bobId);
  });

  it('M2: bob 拉与 alice 的会话历史包含刚发的消息', async () => {
    await seedTestUser(TEST_ALICE);
    await seedTestUser(TEST_BOB);
    const aliceId = await getUserId(TEST_ALICE);
    const bobId = await getUserId(TEST_BOB);
    await seedFriendship(aliceId, bobId);

    const aliceToken = await loginAndGetToken(app as Express, TEST_ALICE);
    const bobToken = await loginAndGetToken(app as Express, TEST_BOB);

    await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ receiverId: bobId, content: TEST_MESSAGE })
      .expect(201);
    // bob给alice发送消息
    const res = await request(app)
      .get(`/api/messages/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.some((m: { content: string }) => m.content === TEST_MESSAGE),
    ).toBe(true);
  });

  it('M3: 非好友发消息返回 403', async () => {
    await seedTestUser(TEST_BOB);
    await seedTestUser(TEST_STRANGER);
    const bobId = await getUserId(TEST_BOB);

    const strangerToken = await loginAndGetToken(app as Express, TEST_STRANGER);

    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        receiverId: bobId,
        content: 'should be rejected',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('只有好友之间才能发送消息');
  });
});