import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  
  // 创建备份目录
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('🔄 开始备份数据库...');

  try {
    // 备份所有表
    const users = await prisma.user.findMany();
    const files = await prisma.file.findMany();
    const preferences = await prisma.userPreference.findMany();

    const backup = {
      timestamp,
      version: '1.0',
      tables: {
        users,
        files,
        preferences
      }
    };

    const backupPath = path.join(backupDir, `backup_${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    
    console.log(`\n✅ 备份完成: ${backupPath}`);
    console.log(`\n📊 备份统计:`);
    console.log(`   - 用户: ${users.length}`);
    console.log(`   - 文件: ${files.length}`);
    console.log(`   - 偏好设置: ${preferences.length}`);
    console.log(`\n💾 备份文件大小: ${(fs.statSync(backupPath).size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('❌ 备份失败:', error);
    throw error;
  }
}

backupDatabase()
  .then(() => {
    console.log('\n✨ 备份任务完成');
    return prisma.$disconnect();
  })
  .catch((error) => {
    console.error('\n💥 备份过程出错:', error);
    prisma.$disconnect();
    process.exit(1);
  });
