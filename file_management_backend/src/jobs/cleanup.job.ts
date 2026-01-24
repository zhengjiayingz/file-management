
import cron from 'node-cron';
import fs from 'fs';

import prisma from '../lib/prisma.js';

/**
 * 初始化物理文件清理定时任务
 * 规则：
 * 1. 检查状态为 pending_delete 的文件
 * 2. 确认引用计数 <= 0
 * 3. 确认标记删除时间超过 24 小时
 * 4. 执行物理删除并移除数据库记录
 */
export const initCleanupJob = () => {
  // 每小时的第 0 分钟执行 (0 * * * *)
  cron.schedule('0 * * * *', async () => {
    console.log('Running cleanup job: checking for files to permanently delete...');
    
    try {
      // 24小时前的时间点
      const retentionThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 查询待删除的文件
      const filesToDelete = await prisma.fileStorage.findMany({
        where: {
          status: 'pending_delete',
          referenceCount: {
            lte: 0
          },
          markedDeleteAt: {
            lt: retentionThreshold
          }
        },
        take: 100 // 每次最多处理100个，避免一次性压力过大
      });

      if (filesToDelete.length === 0) {
        console.log('No files to clean up.');
        return;
      }

      console.log(`Found ${filesToDelete.length} files to delete.`);

      let successCount = 0;
      let failCount = 0;

      for (const file of filesToDelete) {
        try {
          // 1. 物理删除
          if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
            console.log(`Deleted physical file: ${file.filePath}`);
          } else {
            console.warn(`Physical file not found (skipping unlink): ${file.filePath}`);
          }

          // 2. 删除数据库记录
          await prisma.fileStorage.delete({
            where: { id: file.id }
          });
          
          successCount++;
        } catch (err) {
          console.error(`Failed to delete file ID ${file.id}:`, err);
          failCount++;
        }
      }

      console.log(`Cleanup job finished. Success: ${successCount}, Failed: ${failCount}`);

    } catch (error) {
      console.error('Error during cleanup job execution:', error);
    }
  });

  console.log('Cleanup job scheduled (0 * * * *).');
};
