import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';

const nestEnv = resolve(__dirname, '../../.env');
if (existsSync(nestEnv)) dotenv.config({ path: nestEnv });

const TEST_USER_WHERE: Prisma.UserWhereInput = {
  OR: [
    { username: { startsWith: 'e2e_' } },
    { username: { startsWith: 'reg_' } },
    { username: { startsWith: 'dup_' } },
    { username: { startsWith: 'chgpw_' } },
    { username: { startsWith: 'search_a_' } },
    { username: { startsWith: 'search_b_' } },
  ],
};

const TEST_LOGIN_LOG_WHERE: Prisma.LoginLogWhereInput = {
  OR: [
    { username: { startsWith: 'e2e_' } },
    { username: { startsWith: 'reg_' } },
    { username: { startsWith: 'dup_' } },
    { username: { startsWith: 'chgpw_' } },
    { username: { startsWith: 'search_a_' } },
    { username: { startsWith: 'search_b_' } },
  ],
};

async function main() {
  const prisma = new PrismaClient();
  const remainingTestUsers = await prisma.user.count({
    where: TEST_USER_WHERE,
  });
  const testLoginLogs = await prisma.loginLog.count({
    where: TEST_LOGIN_LOG_WHERE,
  });
  const loginLogsNullUser = await prisma.loginLog.count({
    where: { userId: null },
  });
  const orphanStorage = await prisma.fileStorage.count({
    where: { userFiles: { none: {} } },
  });
  const orphanStorageZeroRef = await prisma.fileStorage.count({
    where: { referenceCount: 0, userFiles: { none: {} } },
  });

  const validIds = (await prisma.user.findMany({ select: { id: true } })).map(
    (u) => u.id,
  );

  const tables = {
    users_test_prefix: remainingTestUsers,
    login_logs_test_username: testLoginLogs,
    login_logs_null_userId: loginLogsNullUser,
    file_storage_no_user_file: orphanStorage,
    file_storage_zero_ref_no_file: orphanStorageZeroRef,
    upload_chunks_orphan_user: await prisma.uploadChunk.count({
      where: { NOT: { userId: { in: validIds } } },
    }),
    operation_logs_orphan_user: await prisma.operationLog.count({
      where: { NOT: { userId: { in: validIds } } },
    }),
    messages_orphan_user: await prisma.message.count({
      where: {
        OR: [
          { NOT: { senderId: { in: validIds } } },
          { NOT: { receiverId: { in: validIds } } },
        ],
      },
    }),
    user_files_orphan_user: await prisma.userFile.count({
      where: { NOT: { userId: { in: validIds } } },
    }),
    users_total: await prisma.user.count(),
    user_files: await prisma.userFile.count(),
    messages: await prisma.message.count(),
    friendships: await prisma.friendship.count(),
    operation_logs: await prisma.operationLog.count(),
    file_shares: await prisma.fileShare.count(),
    file_storage: await prisma.fileStorage.count(),
    upload_chunks: await prisma.uploadChunk.count(),
    vip_requests: await prisma.vipUpgradeRequest.count(),
    login_logs: await prisma.loginLog.count(),
  };

  console.log(JSON.stringify(tables, null, 2));
  await prisma.$disconnect();
}

main();
