
import cron from 'node-cron';
import fs from 'fs';

import prisma from '../lib/prisma.js';
import { resolveStorageFilePath } from '../utils/storagePath.utils.js';
import { logger } from '../lib/logger.js';

/**
 * 初始化清理定时任务（每小时）
 * 1. 物理文件：pending_delete、引用计数为 0、标记删除超过 24 小时 → 删磁盘 + 删 file_storage
 * 2. 分享：expire_at 早于当前时间（非永久分享）→ 删 file_shares（share_access_logs 级联删除）
 */
async function cleanupExpiredFileShares(now: Date): Promise<number> {
  let totalDeleted = 0;
  const batchSize = 100;

  for (; ;) {
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
    logger.info('cleanup job started: files (pending_delete) + expired shares');

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
        logger.info({ count: filesToDelete.length }, 'found files to delete');

        for (const file of filesToDelete) {
          try {
            const physicalPath = resolveStorageFilePath(file.filePath);
            if (fs.existsSync(physicalPath)) {
              fs.unlinkSync(physicalPath);
              logger.info({ fileId: file.id, path: file.filePath }, 'deleted physical file');
            } else {
              logger.warn({ fileId: file.id, path: file.filePath }, 'physical file not found, skipping unlink');
            }

            await prisma.fileStorage.delete({
              where: { id: file.id }
            });

            fileSuccess++;
          } catch (err) {
            logger.error({ err, fileId: file.id }, 'failed to delete file');
            fileFail++;
          }
        }
      } else {
        logger.info('no pending_delete files to clean up');
      }

      logger.info({ fileSuccess, fileFail }, 'file cleanup finished');

      // --- 2) 过期分享清理 ---
      const shareDeleted = await cleanupExpiredFileShares(now);
      if (shareDeleted > 0) {
        logger.info({ shareDeleted }, 'expired share records deleted');
      } else {
        logger.info('no expired shares to delete');
      }
    } catch (error) {
      logger.error({ err: error }, 'cleanup job execution failed');
    }
  });

  logger.info({ schedule: '0 * * * *' }, 'cleanup job scheduled');
};
