import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { assertSolveMathImageFile } from '@/files/ai/math/service/files-ai-math.service';
import {
  mathTempTtlHours,
  putMathTempFile,
} from '../helpers/math-temp-storage.helper';

@Injectable()
export class MathTempImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** multipart 上传临时图 */
  async upload(userId: number, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('请上传图片');
    }
    assertSolveMathImageFile(file.originalname || 'image.png', file.mimetype);

    const storage = this.storageService.getStorageProvider();
    const ext = extname(file.originalname || '') || mimeToExt(file.mimetype);
    const storageKey = await putMathTempFile({
      storage,
      userId,
      localFilePath: file.path,
      ext,
    });

    const tempImageId = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(
      Date.now() + mathTempTtlHours() * 60 * 60 * 1000,
    );

    const row = await this.prisma.mathTempImage.create({
      data: {
        tempImageId,
        userId,
        storageKey,
        mime: file.mimetype,
        originalName: file.originalname?.slice(0, 255) || null,
        fileSize: BigInt(file.size),
        expiresAt,
      },
    });

    return {
      success: true as const,
      data: {
        tempImageId: row.tempImageId,
        expiresAt: row.expiresAt.toISOString(),
      },
    };
  }

  /** 丢弃临时图（已消费也可删文件） */
  async remove(userId: number, tempImageId: string) {
    const row = await this.prisma.mathTempImage.findFirst({
      where: { tempImageId, userId },
    });
    if (!row) {
      throw new NotFoundException('临时图不存在');
    }
    const storage = this.storageService.getStorageProvider();
    try {
      await storage.delete(row.storageKey);
    } catch {
      /* 文件可能已删 */
    }
    await this.prisma.mathTempImage.delete({ where: { id: row.id } });
    return { success: true as const };
  }

  /**
   * 取可用临时图：本人、未过期、未消费
   * 过期/已消费 → 410
   */
  async requireUsable(userId: number, tempImageId: string) {
    const row = await this.prisma.mathTempImage.findFirst({
      where: { tempImageId, userId },
    });
    if (!row) {
      throw new NotFoundException('临时图不存在');
    }
    if (row.consumedAt) {
      throw new GoneException('临时图已使用，请重新上传');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('临时图已过期，请重新上传');
    }
    return row;
  }

  /** 读图为 data URL（解题/问答） */
  async readAsDataUrl(userId: number, tempImageId: string) {
    const row = await this.requireUsable(userId, tempImageId);
    const storage = this.storageService.getStorageProvider();
    const exists = await storage.exists(row.storageKey);
    if (!exists) {
      throw new GoneException('临时图文件已丢失');
    }
    const buffer = await readStreamToBuffer(
      await storage.getReadStream(row.storageKey),
    );
    if (!buffer.length) {
      throw new BadRequestException('图片内容为空');
    }
    const mime = row.mime || 'image/png';
    return {
      row,
      imageDataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      buffer,
    };
  }
}

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  return '.png';
}

async function readStreamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
