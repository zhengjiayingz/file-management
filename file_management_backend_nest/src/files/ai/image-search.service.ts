import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'node:stream';

import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { cosineSimilarity } from '@/files/ai/embedding/similarity.util';
import { embedImage } from '@/files/ai/embedding/image-embedding.provider';
import { asEmbedding } from '@/files/query/files-search.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** 参与检索的网盘图片上限（防全库扫爆） */
const MAX_GALLERY = 100;
/** 低于此分不返回（VL 向量尺度与文本不同，阈值偏低） */
const MIN_SCORE = 0.75;
const ALLOWED_QUERY_MIME = /^image\/(jpeg|jpg|png|gif|webp|bmp|heic|heif)$/i;

export type ImageSearchItem = {
  id: number;
  fileName: string;
  fileType: string;
  mimeType: string | null;
  fileSize: number | null;
  parentId: number | null;
  score: number;
};

export type ImageSearchResult = {
  items: ImageSearchItem[];
  galleryCount: number;
  fingerprintReadyCount: number;
};

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

function parseLimit(raw: unknown): number {
  if (raw == null || raw === '') return DEFAULT_LIMIT;
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 1) {
    throw new BadRequestException('limit 无效');
  }
  return Math.min(MAX_LIMIT, Math.trunc(n));
}

@Injectable()
export class ImageSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 以图搜图：查询图 embed → 与用户网盘图片指纹比余弦 → Top-K。
   * 指纹缺失时按需计算并写入 FileFingerprint（MVP，无上传 Job）。
   */
  async searchByImage(
    userId: number,
    file: Express.Multer.File | undefined,
    query: { limit?: unknown },
  ): Promise<ImageSearchResult> {
    if (!file) {
      throw new BadRequestException('请上传查询图片');
    }
    const mime = (file.mimetype || '').trim().toLowerCase();
    if (!ALLOWED_QUERY_MIME.test(mime)) {
      throw new BadRequestException('仅支持 jpeg/png/gif/webp 等常见图片');
    }

    const buffer = await this.resolveUploadBuffer(file);
    if (!buffer.length) {
      throw new BadRequestException('图片内容为空');
    }

    const limit = parseLimit(query.limit);

    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedImage(buffer, mime);
    } catch {
      throw new ServiceUnavailableException('图像向量服务暂时不可用');
    }
    //! 拉取用户网盘图片
    const gallery = await this.prisma.userFile.findMany({
      where: {
        userId,
        isDeleted: false,
        fileType: 'file',
        storage: { mimeType: { startsWith: 'image/' } },
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        parentId: true,
        storage: {
          select: {
            filePath: true,
            mimeType: true,
            fileSize: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_GALLERY,
    });
    //! 计算参与比对的网盘图片数量
    const galleryCount = gallery.length; // 后端最多拉 100 张网盘图参与比对，galleryCount 是实际参与的数量
    if (galleryCount === 0) {
      return { items: [], galleryCount: 0, fingerprintReadyCount: 0 };
    }

    let fingerprintReadyCount = 0;
    const scored: Array<{ userFileId: number; score: number }> = [];

    for (const row of gallery) {
      if (!row.storage?.filePath) continue;
      // !循环目标图片，获取图片的向量
      const emb = await this.ensureFingerprint(
        userId,
        row.id,
        row.storage.filePath,
        row.storage.mimeType,
      );
      if (!emb) continue;
      fingerprintReadyCount += 1;
      //! 计算与查询图片的相似度
      scored.push({
        userFileId: row.id,
        score: cosineSimilarity(queryEmbedding, emb),
      });
    }

    //! 过滤相似度低于阈值的图片
    const ranked = scored
      .filter((s) => s.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // 阈值过滤后没有合格结果：仍返回候选池规模，便于前端提示「库里有图但不够相似」
    if (ranked.length === 0) {
      return { items: [], galleryCount, fingerprintReadyCount };
    }

    // 用 userFileId → 网盘文件元数据，把得分结果拼成前端需要的 items
    const byId = new Map(gallery.map((g) => [g.id, g]));
    const items: ImageSearchItem[] = [];
    for (const r of ranked) {
      const f = byId.get(r.userFileId);
      if (!f) continue; // 理论上不应发生；防御性跳过

      //! 把相似度score结果拼成前端需要的 items
      items.push({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        mimeType: f.storage?.mimeType ?? null,
        fileSize:
          f.storage?.fileSize != null ? Number(f.storage.fileSize) : null,
        parentId: f.parentId,
        score: Number(r.score.toFixed(4)), // 相似度保留四位小数
      });
    }

    // items：Top-K 结果；galleryCount：候选池大小；fingerprintReadyCount：成功算过向量的数量
    return { items, galleryCount, fingerprintReadyCount };
  }

  /** Multer memory / disk 两种存储统一成 Buffer */
  private async resolveUploadBuffer(
    file: Express.Multer.File,
  ): Promise<Buffer> {
    if (file.buffer?.length) return file.buffer;
    if (file.path) {
      const { readFile } = await import('node:fs/promises');
      return readFile(file.path);
    }
    return Buffer.alloc(0);
  }

  /**
   * 读缓存指纹；没有则从存储拉图 embed 并 upsert。
   * 失败记 failed，返回 null（不阻断整次搜索）。
   */
  private async ensureFingerprint(
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
      //! 发送请求到硅基 VL Embedding API，把图片转成向量
      const embedding = await embedImage(buf, mimeType);
      //! 把图片向量写入数据库
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
      //! 返回向量
      return embedding;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message.slice(0, 480) : 'embed 失败';
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
