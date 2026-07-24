import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { MathTempImagesService } from './math-temp-images.service';
import type { SaveTempToDriveDto } from '../dto/math-temp.dto';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class MathTempPromoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly tempImages: MathTempImagesService,
  ) {}

  /**
   * 路径①：临时图 + 可选问答 transcript → 网盘
   */
  async saveToDrive(
    userId: number,
    tempImageId: string,
    dto: SaveTempToDriveDto,
  ) {
    const { row, buffer } = await this.tempImages.readAsDataUrl(
      userId,
      tempImageId,
    );

    if (dto.folderId != null) {
      const folder = await this.prisma.userFile.findFirst({
        where: {
          id: dto.folderId,
          userId,
          isDeleted: false,
          fileType: 'folder',
        },
        select: { id: true },
      });
      if (!folder) {
        throw new BadRequestException('目标文件夹不存在');
      }
    }

    const stamp = formatStamp(new Date());
    const ext = extFromMime(row.mime);
    const imageName =
      (dto.fileName?.trim() || `截图问答-${stamp}${ext}`).slice(0, 255);

    const userFileId = await this.promoteBufferToUserFile({
      userId,
      buffer,
      mime: row.mime,
      fileName: imageName,
      parentId: dto.folderId ?? null,
    });

    let transcriptFileId: number | undefined;
    // 默认不写 Markdown；仅当显式 includeTranscript: true 时生成
    if (dto.includeTranscript === true) {
      const md = await this.buildTranscriptMarkdown(userId, tempImageId);
      if (md.trim()) {
        const mdName = imageName.replace(/\.[^.]+$/, '') + '.md';
        transcriptFileId = await this.promoteBufferToUserFile({
          userId,
          buffer: Buffer.from(md, 'utf8'),
          mime: 'text/markdown',
          fileName: mdName.slice(0, 255),
          parentId: dto.folderId ?? null,
        });
      }
    }

    if (dto.copyChat !== false) {
      await this.copyTempChatToFile(userId, tempImageId, userFileId, 'selection');
    }

    await this.consumeTemp(row.id, row.storageKey, userFileId);

    return {
      success: true as const,
      data: { userFileId, transcriptFileId: transcriptFileId ?? null },
    };
  }

  /**
   * 转正为网盘文件，返回 userFileId（供 from-temp 使用）
   * 幂等：若已消费且已有 promotedUserFileId 则返回之
   */
  async promoteImageOnly(
    userId: number,
    tempImageId: string,
    fileName?: string,
  ): Promise<{ userFileId: number; alreadyPromoted: boolean }> {
    const existing = await this.prisma.mathTempImage.findFirst({
      where: { tempImageId, userId },
    });
    if (!existing) throw new NotFoundException('临时图不存在');
    if (existing.consumedAt && existing.promotedUserFileId) {
      return {
        userFileId: existing.promotedUserFileId,
        alreadyPromoted: true,
      };
    }
    if (existing.consumedAt && !existing.promotedUserFileId) {
      throw new ConflictException('临时图已失效');
    }

    const { row, buffer } = await this.tempImages.readAsDataUrl(
      userId,
      tempImageId,
    );
    const stamp = formatStamp(new Date());
    const ext = extFromMime(row.mime);
    const name = (fileName?.trim() || `解题截图-${stamp}${ext}`).slice(0, 255);
    const userFileId = await this.promoteBufferToUserFile({
      userId,
      buffer,
      mime: row.mime,
      fileName: name,
      parentId: null,
    });
    await this.copyTempChatToFile(userId, tempImageId, userFileId, 'solve');
    await this.consumeTemp(row.id, row.storageKey, userFileId);
    return { userFileId, alreadyPromoted: false };
  }

  private async promoteBufferToUserFile(input: {
    userId: number;
    buffer: Buffer;
    mime: string;
    fileName: string;
    parentId: number | null;
  }): Promise<number> {
    const fileHash = createHash('md5').update(input.buffer).digest('hex');
    const storage = this.storageService.getStorageProvider();
    const tmp = path.join(
      os.tmpdir(),
      `math-temp-promote-${fileHash}-${Date.now()}`,
    );
    await writeFileAsync(tmp, input.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let fileStorage = await tx.fileStorage.findUnique({
          where: { fileHash },
        });

        if (fileStorage && fileStorage.status === 'pending_delete') {
          fileStorage = await tx.fileStorage.update({
            where: { id: fileStorage.id },
            data: { status: 'active', markedDeleteAt: null },
          });
        }

        if (!fileStorage) {
          const storedPath = await storage.putFromLocalFile({
            localFilePath: tmp,
            suggestedName: `${fileHash}-${input.fileName}`,
          });
          fileStorage = await tx.fileStorage.create({
            data: {
              fileHash,
              filePath: storedPath,
              fileSize: BigInt(input.buffer.length),
              mimeType: input.mime,
              referenceCount: 1,
              status: 'active',
            },
          });
        } else {
          fileStorage = await tx.fileStorage.update({
            where: { id: fileStorage.id },
            data: { referenceCount: { increment: 1 } },
          });
          try {
            await unlinkAsync(tmp);
          } catch {
            /* ignore */
          }
        }

        const userFile = await tx.userFile.create({
          data: {
            userId: input.userId,
            storageId: fileStorage.id,
            parentId: input.parentId,
            fileName: input.fileName,
            fileType: 'file',
          },
        });

        await tx.user.update({
          where: { id: input.userId },
          data: {
            storageUsed: { increment: BigInt(input.buffer.length) },
          },
        });

        return userFile.id;
      });
    } catch (e) {
      try {
        await unlinkAsync(tmp);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  private async consumeTemp(
    id: number,
    storageKey: string,
    promotedUserFileId: number,
  ) {
    await this.prisma.mathTempImage.update({
      where: { id },
      data: {
        consumedAt: new Date(),
        promotedUserFileId,
      },
    });
    const storage = this.storageService.getStorageProvider();
    try {
      await storage.delete(storageKey);
    } catch {
      /* 转正后删临时副本；秒传场景可能仍被引用则忽略失败 */
    }
  }

  private async buildTranscriptMarkdown(
    userId: number,
    tempImageId: string,
  ): Promise<string> {
    const session = await this.prisma.tempAiChatSession.findUnique({
      where: {
        userId_tempImageId_mode: {
          userId,
          tempImageId,
          mode: 'selection',
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session?.messages.length) return '';
    const lines = [
      `# 截图问答记录`,
      ``,
      `临时图 ID：\`${tempImageId}\``,
      ``,
    ];
    for (const m of session.messages) {
      const who = m.role === 'user' ? '我' : 'AI';
      lines.push(`## ${who}`, ``, m.content, ``);
    }
    return lines.join('\n');
  }

  private async copyTempChatToFile(
    userId: number,
    tempImageId: string,
    userFileId: number,
    mode: 'selection' | 'solve',
  ) {
    const tempSession = await this.prisma.tempAiChatSession.findUnique({
      where: {
        userId_tempImageId_mode: { userId, tempImageId, mode },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!tempSession?.messages.length) return;

    const fileSession = await this.prisma.fileAiChatSession.upsert({
      where: {
        userId_userFileId_mode: { userId, userFileId, mode },
      },
      create: { userId, userFileId, mode },
      update: {},
      select: { id: true },
    });

    await this.prisma.fileAiChatMessage.createMany({
      data: tempSession.messages.map((m) => ({
        sessionId: fileSession.id,
        role: m.role,
        content: m.content,
      })),
    });
  }
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  if (m.includes('markdown') || m.includes('text')) return '.md';
  return '.png';
}
