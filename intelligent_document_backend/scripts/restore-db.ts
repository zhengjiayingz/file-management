import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface BackupData {
  timestamp: string;
  version: string;
  tables: {
    users: any[];
    files: any[];
    preferences: any[];
  };
}

async function restoreDatabase(backupFile: string) {
  const backupPath = path.join(__dirname, '../backups', backupFile);
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`❌ 备份文件不存在: ${backupPath}`);
  }

  console.log('📂 读取备份文件...');
  const backup: BackupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

  console.log('\n⚠️  开始恢复数据库...');
  console.log(`📅 备份时间: ${backup.timestamp}`);
  console.log(`📦 备份版本: ${backup.version}`);
  console.log(`\n📊 数据统计:`);
  console.log(`   - 用户: ${backup.tables.users.length}`);
  console.log(`   - 文件: ${backup.tables.files.length}`);
  console.log(`   - 偏好设置: ${backup.tables.preferences.length}`);

  // 询问确认
  console.log('\n⚠️  警告: 这将覆盖现有数据！');
  console.log('按 Ctrl+C 取消，或等待 5 秒后自动继续...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    // 恢复用户
    console.log('🔄 恢复用户数据...');
    for (const user of backup.tables.users) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          username: user.username,
          email: user.email,
          password: user.password,
          role: user.role,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt)
        },
        create: {
          id: user.id,
          username: user.username,
          email: user.email,
          password: user.password,
          role: user.role,
          createdAt: new Date(user.createdAt),
          updatedAt: new Date(user.updatedAt)
        }
      });
    }

    // 恢复用户偏好设置
    console.log('🔄 恢复用户偏好设置...');
    for (const pref of backup.tables.preferences) {
      await prisma.userPreference.upsert({
        where: { userId: pref.userId },
        update: {
          locale: pref.locale,
          theme: pref.theme,
          updatedAt: new Date(pref.updatedAt)
        },
        create: {
          userId: pref.userId,
          locale: pref.locale,
          theme: pref.theme,
          createdAt: new Date(pref.createdAt),
          updatedAt: new Date(pref.updatedAt)
        }
      });
    }

    // 恢复文件记录
    console.log('🔄 恢复文件记录...');
    for (const file of backup.tables.files) {
      await prisma.file.upsert({
        where: { id: file.id },
        update: {
          filename: file.filename,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          storage: file.storage,
          uploadedAt: new Date(file.uploadedAt)
        },
        create: {
          id: file.id,
          filename: file.filename,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          userId: file.userId,
          storage: file.storage,
          uploadedAt: new Date(file.uploadedAt)
        }
      });
    }

    console.log('\n✅ 恢复完成！');
  } catch (error) {
    console.error('\n❌ 恢复失败:', error);
    throw error;
  }
}

// 使用示例
const backupFile = process.argv[2];
if (!backupFile) {
  console.error('❌ 错误: 请指定备份文件名');
  console.error('\n使用方法:');
  console.error('  npx tsx scripts/restore-db.ts backup_2026-01-29T12-00-00-000Z.json');
  console.error('\n可用的备份文件:');
  
  const backupDir = path.join(__dirname, '../backups');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    files.forEach(f => console.error(`  - ${f}`));
  } else {
    console.error('  (无备份文件)');
  }
  
  process.exit(1);
}

restoreDatabase(backupFile)
  .then(() => {
    console.log('\n✨ 恢复任务完成');
    return prisma.$disconnect();
  })
  .catch((error) => {
    console.error('\n💥 恢复过程出错:', error);
    prisma.$disconnect();
    process.exit(1);
  });
