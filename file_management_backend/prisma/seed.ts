import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始数据库种子...');

  // 清空现有数据（可选）
  await prisma.file.deleteMany();
  await prisma.user.deleteMany();

  // 创建默认用户
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      email: 'admin@example.com'
    }
  });

  console.log('✅ 创建默认用户:', admin.username);

  // 可以添加更多种子数据
  const testUser = await prisma.user.create({
    data: {
      username: 'test',
      password: hashedPassword,
      email: 'test@example.com'
    }
  });

  console.log('✅ 创建测试用户:', testUser.username);

  console.log('🎉 数据库种子完成！');
}

main()
  .catch((e) => {
    console.error('❌ 数据库种子失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
