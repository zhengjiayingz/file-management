/**
 * 为所有非管理员用户建立与主管理员的已接受好友关系（幂等）
 * 运行: npx tsx scripts/backfill-admin-friends.ts
 */
import prisma from '../src/lib/prisma.js';
import { ensureFriendshipWithAdmin, getPrimaryAdminId } from '../src/services/adminFriend.service.js';

async function main() {
  const adminId = await getPrimaryAdminId();
  if (!adminId) {
    console.error('未找到管理员用户（role=admin）');
    process.exit(1);
  }
  console.log('管理员 ID:', adminId);

  const users = await prisma.user.findMany({
    where: {
      NOT: { id: adminId },
      role: { not: 'admin' }
    },
    select: { id: true, username: true }
  });

  for (const u of users) {
    try {
      await ensureFriendshipWithAdmin(u.id);
      console.log('OK:', u.username, u.id);
    } catch (e) {
      console.error('FAIL:', u.username, e);
    }
  }

  console.log('完成，共处理', users.length, '个用户');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
