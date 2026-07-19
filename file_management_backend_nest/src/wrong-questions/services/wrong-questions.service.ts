import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { extractTextFromImage } from '@/files/ai/vision/vision.provider';
import { assertSolveMathImageFile } from '@/files/ai/files-ai-math.service';
import type {
  CreateWrongQuestionDto,
  ListWrongQuestionsQueryDto,
  UpdateWrongQuestionDto,
} from '../dto/wrong-questions.dto';

/** 规范化 tags：trim、去空、去重，最多 20 个 */
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, 40));
    if (out.length >= 20) break;
  }
  return out;
}

/** 将 Prisma Json 字段读成 string[] */
export function tagsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

/** 题干是否应视为无效、需 OCR 重抽 */
export function needsOcrQuestionText(questionText: string | undefined): boolean {
  const q = (questionText ?? '').trim();
  if (!q) return true;
  if (
    q === '见原题图片' ||
    q === '見原題圖片' ||
    q === 'See original image'
  ) {
    return true;
  }
  // 误把解题提示词当题干
  if (
    q.includes('请根据题目图片分步解答') ||
    q.includes('公式使用 LaTeX') ||
    q.includes('Please solve step by step')
  ) {
    return true;
  }
  return false;
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

@Injectable()
export class WrongQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** 创建错题：校验本人网盘图片；题干无效时对原图 OCR */
  async create(userId: number, dto: CreateWrongQuestionDto) {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: dto.userFileId, userId, isDeleted: false },
      select: {
        id: true,
        fileName: true,
        storage: { select: { filePath: true, mimeType: true } },
      },
    });
    if (!userFile?.storage) {
      throw new NotFoundException('文件不存在');
    }
    try {
      assertSolveMathImageFile(userFile.fileName, userFile.storage.mimeType);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : '仅支持图片文件',
      );
    }

    let questionText = (dto.questionText ?? '').trim();
    if (needsOcrQuestionText(questionText)) {
      questionText = await this.ocrQuestionFromStorage(
        userFile.storage.filePath,
        userFile.storage.mimeType,
      );
    }

    const row = await this.prisma.wrongQuestionBookItem.create({
      data: {
        userId,
        userFileId: userFile.id,
        questionText,
        answerText: dto.answerText.trim(),
        tags: normalizeTags(dto.tags),
        difficulty: dto.difficulty ?? 'medium',
      },
    });
    return this.toDto(row, {
      fileName: userFile.fileName,
      imageAvailable: true,
    });
  }

  /** 用原图 OCR 刷新题干（修复历史误存） */
  async refreshQuestionFromOcr(userId: number, id: number) {
    const row = await this.prisma.wrongQuestionBookItem.findFirst({
      where: { id, userId },
      select: {
        id: true,
        userFile: {
          select: {
            fileName: true,
            isDeleted: true,
            storage: { select: { filePath: true, mimeType: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('错题不存在');
    if (!row.userFile || row.userFile.isDeleted || !row.userFile.storage) {
      throw new BadRequestException('原图不可用，无法识别题干');
    }
    assertSolveMathImageFile(
      row.userFile.fileName,
      row.userFile.storage.mimeType,
    );

    const questionText = await this.ocrQuestionFromStorage(
      row.userFile.storage.filePath,
      row.userFile.storage.mimeType,
    );
    await this.prisma.wrongQuestionBookItem.update({
      where: { id },
      data: { questionText },
    });
    return this.getOne(userId, id);
  }

  /** 分页列表（可选按 tag / difficulty / 存入时间过滤） */
  async list(userId: number, query: ListWrongQuestionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const tag = query.tag?.trim();
    const difficulty = query.difficulty;
    const createdFrom = query.createdFrom?.trim();
    const createdTo = query.createdTo?.trim();

    const createdAt:
      | { gte?: Date; lte?: Date }
      | undefined = (() => {
      if (!createdFrom && !createdTo) return undefined;
      const range: { gte?: Date; lte?: Date } = {};
      if (createdFrom) {
        range.gte = new Date(createdFrom);
      }
      if (createdTo) {
        const end = new Date(createdTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      return range;
    })();

    const rows = await this.prisma.wrongQuestionBookItem.findMany({
      where: {
        userId,
        ...(difficulty ? { difficulty } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        userFile: {
          select: {
            fileName: true,
            isDeleted: true,
            storageId: true,
          },
        },
      },
    });

    const filtered = tag
      ? rows.filter((r) => tagsFromJson(r.tags).includes(tag))
      : rows;
    const total = filtered.length;
    const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: pageRows.map((r) =>
        this.toDto(r, {
          fileName: r.userFile?.fileName ?? null,
          imageAvailable: Boolean(
            r.userFile && !r.userFile.isDeleted && r.userFile.storageId != null,
          ),
        }),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** 详情：非本人 404 */
  async getOne(userId: number, id: number) {
    const row = await this.prisma.wrongQuestionBookItem.findFirst({
      where: { id, userId },
      include: {
        userFile: {
          select: {
            fileName: true,
            isDeleted: true,
            storageId: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('错题不存在');
    return this.toDto(row, {
      fileName: row.userFile?.fileName ?? null,
      imageAvailable: Boolean(
        row.userFile && !row.userFile.isDeleted && row.userFile.storageId != null,
      ),
    });
  }

  /** 更新题干/解答/标签/难度 */
  async update(userId: number, id: number, dto: UpdateWrongQuestionDto) {
    const existing = await this.prisma.wrongQuestionBookItem.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('错题不存在');

    const data: Prisma.WrongQuestionBookItemUpdateInput = {};
    if (dto.questionText !== undefined) {
      data.questionText = dto.questionText.trim();
    }
    if (dto.answerText !== undefined) {
      data.answerText = dto.answerText.trim();
    }
    if (dto.tags !== undefined) {
      data.tags = normalizeTags(dto.tags);
    }
    if (dto.difficulty !== undefined) {
      data.difficulty = dto.difficulty;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('没有可更新的字段');
    }

    await this.prisma.wrongQuestionBookItem.update({
      where: { id },
      data,
    });
    return this.getOne(userId, id);
  }

  /** 删除条目（不删网盘文件） */
  async remove(userId: number, id: number): Promise<void> {
    const existing = await this.prisma.wrongQuestionBookItem.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('错题不存在');
    await this.prisma.wrongQuestionBookItem.delete({ where: { id } });
  }

  /** 读盘 → DeepSeek-OCR 抽题干文字 */
  private async ocrQuestionFromStorage(
    filePath: string,
    mimeType: string | null | undefined,
  ): Promise<string> {
    const storage = this.storageService.getStorageProvider();
    const exists = await storage.exists(filePath);
    if (!exists) {
      throw new BadRequestException('原图不可用，无法识别题干');
    }
    const buffer = await readStreamToBuffer(
      await storage.getReadStream(filePath),
    );
    if (!buffer.length) {
      throw new BadRequestException('图片内容为空，无法识别题干');
    }
    const mime =
      (mimeType ?? 'image/png').trim().toLowerCase() || 'image/png';
    try {
      const text = (await extractTextFromImage(buffer, mime)).trim();
      if (!text) {
        throw new Error('empty');
      }
      return text.length > 20_000 ? `${text.slice(0, 20_000)}…` : text;
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error && e.message && e.message !== 'empty'
          ? `题干识别失败：${e.message}`
          : '题干识别失败，请手改题干',
      );
    }
  }

  private toDto(
    row: {
      id: number;
      userId: number;
      userFileId: number | null;
      questionText: string;
      answerText: string;
      tags: unknown;
      difficulty: 'easy' | 'medium' | 'hard';
      createdAt: Date;
      updatedAt: Date;
    },
    extra: { fileName: string | null; imageAvailable: boolean },
  ) {
    return {
      id: row.id,
      userId: row.userId,
      userFileId: row.userFileId,
      questionText: row.questionText,
      answerText: row.answerText,
      tags: tagsFromJson(row.tags),
      difficulty: row.difficulty,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      fileName: extra.fileName,
      imageAvailable: extra.imageAvailable,
    };
  }
}
