
import cron from 'node-cron';
import fs from 'fs';

import prisma from '../lib/prisma.js';
import { resolveStorageFilePath } from '../utils/storagePath.utils.js';

/**
 * 初始化清理定时任务（每小时）
 * 1. 物理文件：pending_delete、引用计数为 0、标记删除超过 24 小时 → 删磁盘 + 删 file_storage
 * 2. 分享：expire_at 早于当前时间（非永久分享）→ 删 file_shares（share_access_logs 级联删除）
 */
async function cleanupExpiredFileShares(now: Date): Promise<number> {
  let totalDeleted = 0;
  const batchSize = 100;

  for (;;) {
    const batch = await prisma.fileShare.findMany({
      where: {
        expireAt: { lt: now }
      },
      select: { id: true },
      take: batchSize
    });

    if (batch.length === 0) break;

    const { count } = await prisma.fileShare.deleteMany({
      where: { id: { in: batch.map((r) => r.id) } }
    });
    totalDeleted += count;

    if (batch.length < batchSize) break;
  }

  return totalDeleted;
}

export const initCleanupJob = () => {
  // 每小时的第 0 分钟执行 (0 * * * *)
  cron.schedule('0 * * * *', async () => {
    console.log('Running cleanup job: files (pending_delete) + expired shares...');

    try {
      const now = new Date();

      // --- 1) 物理文件清理 ---
      const retentionThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
        take: 100
      });

      let fileSuccess = 0;
      let fileFail = 0;

      if (filesToDelete.length > 0) {
        console.log(`Found ${filesToDelete.length} files to delete.`);

        for (const file of filesToDelete) {
          try {
            const physicalPath = resolveStorageFilePath(file.filePath);
            if (fs.existsSync(physicalPath)) {
              fs.unlinkSync(physicalPath);
              console.log(`Deleted physical file: ${physicalPath}`);
            } else {
              console.warn(`Physical file not found (skipping unlink): ${file.filePath}`);
            }

            await prisma.fileStorage.delete({
              where: { id: file.id }
            });

            fileSuccess++;
          } catch (err) {
            console.error(`Failed to delete file ID ${file.id}:`, err);
            fileFail++;
          }
        }
      } else {
        console.log('No pending_delete files to clean up.');
      }

      console.log(`File cleanup: success ${fileSuccess}, failed ${fileFail}`);

      // --- 2) 过期分享清理 ---
      const shareDeleted = await cleanupExpiredFileShares(now);
      if (shareDeleted > 0) {
        console.log(`Expired share records deleted: ${shareDeleted}`);
      } else {
        console.log('No expired shares to delete.');
      }
    } catch (error) {
      console.error('Error during cleanup job execution:', error);
    }
  });

  console.log('Cleanup job scheduled (0 * * * *).');
};
