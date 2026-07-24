import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdmin() {
  try {
    const admin = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (admin) {
      console.log('✅ 找到管理员账户：');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`ID: ${admin.id}`);
      console.log(`用户名: ${admin.username}`);
      console.log(`邮箱: ${admin.email}`);
      console.log(`角色: ${admin.role}`);
      console.log(`状态: ${admin.status}`);
      console.log(`密码哈希: ${admin.password.substring(0, 20)}...`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('❌ 未找到管理员账户');
    }

    // 列出所有用户
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        status: true
      }
    });

    console.log('\n📋 数据库中的所有用户：');
    console.log(allUsers);

  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdmin();
