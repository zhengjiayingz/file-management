/**
 * 数据库连接测试脚本
 * 运行: node test-db-connection.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  console.log('🔍 开始测试数据库连接...\n');

  try {
    // 测试 1: 连接数据库
    console.log('📡 测试 1: 尝试连接数据库...');
    await prisma.$connect();
    console.log('✅ 数据库连接成功！\n');

    // 测试 2: 执行简单查询
    console.log('📊 测试 2: 执行测试查询...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ 查询执行成功！', result, '\n');

    // 测试 3: 检查数据库信息
    console.log('🗄️  测试 3: 获取数据库信息...');
    const dbInfo = await prisma.$queryRaw`SELECT DATABASE() as db_name, VERSION() as version`;
    console.log('✅ 数据库信息:', dbInfo, '\n');

    // 测试 4: 检查表是否存在
    console.log('📋 测试 4: 检查数据表...');
    try {
      const userCount = await prisma.user.count();
      console.log(`✅ users 表存在，当前有 ${userCount} 条记录\n`);
    } catch (error) {
      console.log('⚠️  users 表不存在，需要运行迁移: npx prisma migrate dev\n');
    }

    console.log('🎉 所有测试通过！数据库连接正常！');

  } catch (error) {
    console.error('❌ 数据库连接失败！\n');
    console.error('错误信息:', error.message);
    console.error('\n💡 可能的原因:');
    console.error('1. MySQL 服务未启动');
    console.error('2. 用户名或密码错误');
    console.error('3. 数据库不存在（需要先创建数据库）');
    console.error('4. 主机或端口配置错误');
    console.error('5. 用户没有访问权限\n');
    console.error('📝 当前 DATABASE_URL:', process.env.DATABASE_URL || '未设置');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
