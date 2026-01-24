import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// SHA256 密码加密（与登录控制器一致）
const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

async function createAdminUser() {
  try {
    // 管理员账户信息
    const adminUsername = 'admin';
    const adminPassword = 'admin123';
    const adminEmail = 'admin@example.com';

    // 检查管理员是否已存在
    const existingAdmin = await prisma.user.findUnique({
      where: { username: adminUsername }
    });

    if (existingAdmin) {
      console.log('❌ 管理员账户已存在，正在删除旧账户并重新创建...');
      
      // 删除旧账户
      await prisma.user.delete({
        where: { id: existingAdmin.id }
      });
    }

    // 加密密码（使用 SHA256）
    const hashedPassword = hashPassword(adminPassword);

    // 创建管理员用户
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        email: adminEmail,
        role: 'admin',
        storageQuota: BigInt(107374182400), // 100GB
        status: 'active'
      }
    });

    console.log('✅ 管理员账户创建成功！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 账户信息：');
    console.log(`   用户名: ${adminUsername}`);
    console.log(`   密码: ${adminPassword}`);
    console.log(`   邮箱: ${adminEmail}`);
    console.log(`   角色: ${admin.role}`);
    console.log(`   存储配额: 100GB`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  请在首次登录后立即修改密码！');

  } catch (error) {
    console.error('❌ 创建管理员账户失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
