import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

async function createAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';

  if (!adminPassword) {
    console.error('请设置环境变量 ADMIN_PASSWORD（可在 .env 中配置）');
    process.exit(1);
  }

  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { username: adminUsername },
    });

    if (existingAdmin) {
      console.log('❌ 管理员账户已存在，正在删除旧账户并重新创建...');

      await prisma.user.delete({
        where: { id: existingAdmin.id },
      });
    }

    const hashedPassword = hashPassword(adminPassword);

    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        email: adminEmail,
        role: 'admin',
        storageQuota: BigInt(107374182400),
        status: 'active',
      },
    });

    console.log('✅ 管理员账户创建成功！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 账户信息：');
    console.log(`   用户名: ${adminUsername}`);
    console.log(`   邮箱: ${adminEmail}`);
    console.log(`   角色: ${admin.role}`);
    console.log(`   存储配额: 100GB`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  请在首次登录后立即修改密码！');

  } catch (error) {
    console.error('❌ 创建管理员账户失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
