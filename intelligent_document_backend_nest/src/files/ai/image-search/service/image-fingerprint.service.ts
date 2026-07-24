import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';

import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { embedImage } from '@/files/ai/image-search/provider/image-embedding.provider';
import { asEmbedding } from '@/files/query/files-search.service';

async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}

/**
 * 图片视觉指纹（FileFingerprint.imageEmbedding）。
 * 以图搜图按需写入；文档索引对图片也会写入，供近重扫描。
 */
@Injectable()
export class ImageFingerprintService {
  private readonly logger = new Logger(ImageFingerprintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 读缓存指纹；没有则从存储拉图 embed 并 upsert。
   * 失败记 failed，返回 null（调用方可选择不阻断主流程）。
   */
  async ensure(
    userId: number,
    userFileId: number,
    storedPath: string,
    mimeType: string | null,
  ): Promise<number[] | null> {
    const existing = await this.prisma.fileFingerprint.findUnique({
      where: { userFileId },
      select: { status: true, imageEmbedding: true },
    });
    if (existing?.status === 'ready') {
      const emb = asEmbedding(existing.imageEmbedding);
      if (emb) return emb;
    }

    try {
      const storage = this.storageService.getStorageProvider();
      const exists = await storage.exists(storedPath);
      if (!exists) {
        await this.markFailed(userId, userFileId, '存储文件不存在');
        return null;
      }
      const buf = await readStreamToBuffer(
        await storage.getReadStream(storedPath),
      );
      if (!buf.length) {
        await this.markFailed(userId, userFileId, '图片内容为空');
        return null;
      }
      const embedding = await embedImage(buf, mimeType);
      await this.prisma.fileFingerprint.upsert({
        where: { userFileId },
        create: {
          userFileId,
          userId,
          imageEmbedding: embedding,
          status: 'ready',
          errorMessage: null,
        },
        update: {
          imageEmbedding: embedding,
          status: 'ready',
          errorMessage: null,
        },
      });
      return embedding;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message.slice(0, 480) : 'embed 失败';
      this.logger.warn(
        `image fingerprint failed userFileId=${userFileId}: ${msg}`,
      );
      await this.markFailed(userId, userFileId, msg);
      return null;
    }
  }

  private async markFailed(
    userId: number,
    userFileId: number,
    errorMessage: string,
  ) {
    await this.prisma.fileFingerprint.upsert({
      where: { userFileId },
      create: {
        userFileId,
        userId,
        status: 'failed',
        errorMessage,
      },
      update: {
        status: 'failed',
        errorMessage,
      },
    });
  }
}
