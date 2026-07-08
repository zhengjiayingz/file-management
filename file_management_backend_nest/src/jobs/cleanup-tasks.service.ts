import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import fs from 'node:fs';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveStorageFilePath } from '@/files/utils/storagePath.utils';

export type CleanupRunResult = {
  filesDeleted: number;
  sharesDeleted: number;
  fileFailures: number;
};

@Injectable()
export class CleanupTasksService {
  private readonly logger = new Logger(CleanupTasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 每小时第 0 分执行（与 Express cleanup.job 一致） */
  @Cron('0 * * * *')
  async handleScheduledCleanup(): Promise<void> {
    this.logger.log('cleanup job started: files (pending_delete) + expired shares');
    const result = await this.runCleanupOnce();
    this.logger.log(
      `cleanup finished files=${result.filesDeleted} shares=${result.sharesDeleted} fileFailures=${result.fileFailures}`,
    );
  }

  async runCleanupOnce(now = new Date()): Promise<CleanupRunResult> {
    let filesDeleted = 0;
    let fileFailures = 0;

    const retentionThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const filesToDelete = await this.prisma.fileStorage.findMany({
      where: {
        status: 'pending_delete',
        referenceCount: { lte: 0 },
        markedDeleteAt: { lt: retentionThreshold },
      },
      take: 100,
    });

    for (const file of filesToDelete) {
      try {
        const physicalPath = resolveStorageFilePath(file.filePath);
        if (fs.existsSync(physicalPath)) {
          fs.unlinkSync(physicalPath);
          this.logger.log(`deleted physical file id=${file.id} path=${file.filePath}`);
        }
        await this.prisma.fileStorage.delete({ where: { id: file.id } });
        filesDeleted++;
      } catch (err) {
        fileFailures++;
        this.logger.error(`failed to delete file id=${file.id}`, err);
      }
    }

    const sharesDeleted = await this.cleanupExpiredFileShares(now);
    return { filesDeleted, sharesDeleted, fileFailures };
  }

  private async cleanupExpiredFileShares(now: Date): Promise<number> {
    let totalDeleted = 0;
    const batchSize = 100;

    for (;;) {
      const batch = await this.prisma.fileShare.findMany({
        where: { expireAt: { lt: now } },
        select: { id: true },
        take: batchSize,
      });
      if (batch.length === 0) break;

      const { count } = await this.prisma.fileShare.deleteMany({
        where: { id: { in: batch.map((r) => r.id) } },
      });
      totalDeleted += count;
      if (batch.length < batchSize) break;
    }

    return totalDeleted;
  }
}
