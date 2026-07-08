import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';

/** 与 test/helpers 中 registerE2eUser / loginAndGetTokens 等一致 */
export const E2E_TEST_USER_WHERE: Prisma.UserWhereInput = {
  OR: [
    { username: { startsWith: 'e2e_' } },
    { username: { startsWith: 'reg_' } },
    { username: { startsWith: 'dup_' } },
    { username: { startsWith: 'chgpw_' } },
    { username: { startsWith: 'search_a_' } },
    { username: { startsWith: 'search_b_' } },
  ],
};

export const E2E_TEST_LOGIN_LOG_WHERE: Prisma.LoginLogWhereInput = {
  OR: [
    { username: { startsWith: 'e2e_' } },
    { username: { startsWith: 'reg_' } },
    { username: { startsWith: 'dup_' } },
    { username: { startsWith: 'chgpw_' } },
    { username: { startsWith: 'search_a_' } },
    { username: { startsWith: 'search_b_' } },
  ],
};

export type E2eCleanupResult = {
  users: number;
  loginLogs: number;
  orphanedFileStorage: number;
};

function loadE2eEnv(): void {
  const nestEnv = resolve(__dirname, '../../.env');
  const expressEnv = resolve(__dirname, '../../../file_management_backend/.env');
  if (existsSync(nestEnv)) {
    dotenv.config({ path: nestEnv });
  } else if (existsSync(expressEnv)) {
    dotenv.config({ path: expressEnv });
  }
}

export async function cleanupE2eTestData(options?: {
  prisma?: PrismaClient;
  verbose?: boolean;
}): Promise<E2eCleanupResult> {
  const verbose = options?.verbose ?? false;
  const ownedClient = !options?.prisma;
  if (ownedClient) {
    loadE2eEnv();
  }
  const prisma = options?.prisma ?? new PrismaClient();

  try {
    const testUserCount = await prisma.user.count({
      where: E2E_TEST_USER_WHERE,
    });

    if (testUserCount === 0) {
      if (verbose) {
        console.log('[e2e cleanup] 无测试用户，跳过');
      }
      return { users: 0, loginLogs: 0, orphanedFileStorage: 0 };
    }

    if (verbose) {
      console.log(`[e2e cleanup] 将删除 ${testUserCount} 个测试用户及关联数据…`);
    }

    const deletedLoginLogs = await prisma.loginLog.deleteMany({
      where: E2E_TEST_LOGIN_LOG_WHERE,
    });

    const deletedUsers = await prisma.user.deleteMany({
      where: E2E_TEST_USER_WHERE,
    });

    const orphanedStorage = await prisma.fileStorage.deleteMany({
      where: { userFiles: { none: {} } },
    });

    const result: E2eCleanupResult = {
      users: deletedUsers.count,
      loginLogs: deletedLoginLogs.count,
      orphanedFileStorage: orphanedStorage.count,
    };

    if (verbose) {
      console.log('[e2e cleanup] 完成:', result);
    }

    return result;
  } finally {
    if (ownedClient) {
      await prisma.$disconnect();
    }
  }
}

export async function previewE2eCleanup(): Promise<void> {
  loadE2eEnv();
  const prisma = new PrismaClient();
  try {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const dbName = dbUrl.match(/\/([^/?]+)(\?|$)/)?.[1] ?? 'unknown';
    console.log(`数据库: ${dbName}`);
    console.log('模式: 预览\n');

    const totalUsers = await prisma.user.count();
    const testUsers = await prisma.user.findMany({
      where: E2E_TEST_USER_WHERE,
      select: { id: true, username: true, role: true },
      orderBy: { id: 'asc' },
    });
    const keepUsers = await prisma.user.findMany({
      where: { NOT: E2E_TEST_USER_WHERE },
      select: { id: true, username: true, role: true },
      orderBy: { id: 'asc' },
      take: 20,
    });

    console.log(`用户总数: ${totalUsers}`);
    console.log(`将删除测试用户: ${testUsers.length}`);
    console.log(`将保留用户: ${totalUsers - testUsers.length}`);

    if (testUsers.length > 0) {
      console.log('\n测试用户样例（前 5 / 后 5）:');
      const sample = [
        ...testUsers.slice(0, 5),
        ...(testUsers.length > 10 ? testUsers.slice(-5) : []),
      ];
      for (const u of sample) {
        console.log(`  #${u.id} ${u.username} (${u.role})`);
      }
    }

    if (keepUsers.length > 0) {
      console.log('\n保留用户样例（最多 20 个）:');
      for (const u of keepUsers) {
        console.log(`  #${u.id} ${u.username} (${u.role})`);
      }
    }

    const orphanStorage = await prisma.fileStorage.count({
      where: { userFiles: { none: {} } },
    });
    console.log(`\n无 user_file 引用的 file_storage: ${orphanStorage}`);
  } finally {
    await prisma.$disconnect();
  }
}
