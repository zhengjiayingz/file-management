// 查看数据库中的文件记录
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('📊 查看数据库中的文件记录...\n');

  try {
    // 1. 查看物理文件存储记录
    console.log('1. 物理文件存储记录 (file_storage):');
    const fileStorage = await prisma.fileStorage.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    fileStorage.forEach((file, index) => {
      console.log(`   ${index + 1}. 哈希: ${file.fileHash}`);
      console.log(`      路径: ${file.filePath}`);
      console.log(`      大小: ${file.fileSize} bytes`);
      console.log(`      类型: ${file.mimeType}`);
      console.log(`      引用数: ${file.referenceCount}`);
      console.log(`      状态: ${file.status}`);
      console.log(`      创建时间: ${file.createdAt}`);
      console.log('');
    });

    // 2. 查看用户文件记录
    console.log('2. 用户文件记录 (user_files):');
    const userFiles = await prisma.userFile.findMany({
      include: {
        user: {
          select: { username: true }
        },
        storage: {
          select: { fileSize: true, mimeType: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    userFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. 文件名: ${file.fileName}`);
      console.log(`      用户: ${file.user.username}`);
      console.log(`      类型: ${file.fileType}`);
      console.log(`      大小: ${file.storage ? Number(file.storage.fileSize) : 0} bytes`);
      console.log(`      MIME: ${file.storage?.mimeType || 'folder'}`);
      console.log(`      父目录ID: ${file.parentId || '根目录'}`);
      console.log(`      是否删除: ${file.isDeleted}`);
      console.log(`      创建时间: ${file.createdAt}`);
      console.log('');
    });

    // 3. 查看用户存储使用情况
    console.log('3. 用户存储使用情况:');
    const users = await prisma.user.findMany({
      select: {
        username: true,
        storageQuota: true,
        storageUsed: true,
        _count: {
          select: { userFiles: true }
        }
      }
    });

    users.forEach((user, index) => {
      const usedMB = Number(user.storageUsed) / (1024 * 1024);
      const quotaMB = Number(user.storageQuota) / (1024 * 1024);
      const usagePercent = quotaMB > 0 ? (usedMB / quotaMB * 100).toFixed(2) : 0;
      
      console.log(`   ${index + 1}. 用户: ${user.username}`);
      console.log(`      文件数量: ${user._count.userFiles}`);
      console.log(`      已使用: ${usedMB.toFixed(2)} MB`);
      console.log(`      配额: ${quotaMB.toFixed(2)} MB`);
      console.log(`      使用率: ${usagePercent}%`);
      console.log('');
    });

    // 4. 查看分片上传记录（如果有）
    console.log('4. 分片上传记录 (upload_chunks):');
    const chunks = await prisma.uploadChunk.findMany({
      include: {
        user: {
          select: { username: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (chunks.length > 0) {
      chunks.forEach((chunk, index) => {
        console.log(`   ${index + 1}. 文件哈希: ${chunk.fileHash}`);
        console.log(`      用户: ${chunk.user.username}`);
        console.log(`      分片索引: ${chunk.chunkIndex}`);
        console.log(`      分片大小: ${chunk.chunkSize} bytes`);
        console.log(`      状态: ${chunk.status}`);
        console.log(`      创建时间: ${chunk.createdAt}`);
        console.log('');
      });
    } else {
      console.log('   没有分片上传记录');
    }

  } catch (error) {
    console.error('❌ 查询数据库时出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();