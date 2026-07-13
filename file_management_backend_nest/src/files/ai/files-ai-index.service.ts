import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentIndexMode, DocumentIndexStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { isIndexableTextDocument } from './chunk/text-extractor';
import { DocumentIndexQueueService } from '@/files/ai/document-index-queue.service';
import {
  isSummaryGenre,
  toIndexMode,
  type SummaryGenreValue,
} from '@/files/ai/summary/summary-genre.types';

const ACTIVE_STATUSES: DocumentIndexStatus[] = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'summarizing',
  'extracting_knowledge',
];
// 校验 summaryGenre
function validateIndexBody(body: unknown): {
  summaryGenre: SummaryGenreValue;
  force: boolean;
} {
  if (body == null || typeof body !== 'object') {
    throw new BadRequestException('summaryGenre 必填');
  }
  const payload = body as { summaryGenre?: unknown; force?: unknown };
  const genre = payload.summaryGenre;
  if (!isSummaryGenre(genre)) {
    throw new BadRequestException('summaryGenre 无效');
  }
  return {
    summaryGenre: genre,
    force: payload.force === true,
  };
}

function toStatusDto(job: {
  status: DocumentIndexStatus;
  progress: number;
  progressMsg: string | null;
  chunkCount: number;
  errorMessage: string | null;
  mode: DocumentIndexMode;
  summaryGenre: SummaryGenreValue | null;
  updatedAt: Date;
}) {
  return {
    status: job.status,
    mode: job.mode,
    progress: job.progress,
    progressMsg: job.progressMsg,
    chunkCount: job.chunkCount,
    errorMessage: job.errorMessage,
    updatedAt: job.updatedAt.toISOString(),
    summaryGenre: job.summaryGenre,
  };
}

@Injectable()
export class FilesAiIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexQueue: DocumentIndexQueueService,
  ) {}

  /** POST /api/files/:id/ai/index */
  // 在用户点「建立索引」时，做校验、重置 DB 状态、把任务丢进 Redis 队列，然后立刻返回当前状态
  async triggerIndex(userId: number, fileId: number, body: unknown) {
    const { summaryGenre, force } = validateIndexBody(body);
    const mode = toIndexMode(summaryGenre); // 用体裁推导索引模式，general或者academic
    // 查文件是否存在且属于当前用户
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        storage: { select: { mimeType: true, filePath: true, fileHash: true } },
      },
    });
    // 文件存在性校验
    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }
    if (userFile.fileType === 'folder') {
      throw new BadRequestException('文件夹不支持索引');
    }
    if (!userFile.storage) {
      throw new NotFoundException('文件不存在');
    }
    // 格式校验 txt/md，扩展名 + MIME 双判断
    if (
      !isIndexableTextDocument({
        fileName: userFile.fileName,
        mimeType: userFile.storage.mimeType,
      })
    ) {
      throw new BadRequestException(
        '仅支持 UTF-8 编码的 .txt / .md、含文字层的 .pdf 及 .docx 文件',
      );
    }
    // 是否已有进行中的任务，每个文件在 document_index_jobs 里最多一行（userFileId 唯一）。
    const existing = await this.prisma.documentIndexJob.findUnique({
      where: { userFileId: fileId },
    });
    // ACTIVE_STATUSES 包括：pending、extracting、chunking、embedding 等
    if (existing && ACTIVE_STATUSES.includes(existing.status)) {
      throw new ConflictException('索引任务进行中，请稍后再试');
    }
    if (
      !force &&
      existing?.status === 'ready' &&
      existing.indexedFileHash &&
      existing.indexedFileHash === userFile.storage.fileHash
    ) {
      throw new ConflictException('检查到文档未更新，无需重新建立索引');
    }

    // ready（内容已变）/ failed / 无记录 → 允许（重新）索引
    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { userFileId: fileId } });
      await tx.documentSummary.deleteMany({ where: { userFileId: fileId } });
      await tx.documentKnowledge.deleteMany({ where: { userFileId: fileId } });
      await tx.documentIndexJob.upsert({
        where: { userFileId: fileId },
        create: {
          userFileId: fileId,
          mode, // 用户选的 general/academic
          summaryGenre,
          status: 'pending', //等待 Worker 处理
          progress: 0, // 进度 0%
          progressMsg: '已加入队列', // 给前端看的提示
          chunkCount: 0, // 还没切块
          errorMessage: null, // 清掉上次失败信息
        },
        // 更新的时候
        update: {
          mode, // 用户选的 general/academic
          summaryGenre,
          status: 'pending', //等待 Worker 处理
          progress: 0, // 进度 0%
          progressMsg: '已加入队列', // 给前端看的提示
          chunkCount: 0, // 还没切块
          errorMessage: null, // 清掉上次失败信息
        },
      });
    });
    // 入队 BullMQ
    await this.indexQueue.enqueueDocumentIndex({
      userFileId: fileId,
      userId,
      mode,
      summaryGenre,
    });
    // 读最新状态并返回
    const job = await this.prisma.documentIndexJob.findUniqueOrThrow({
      where: { userFileId: fileId },
    });

    return {
      success: true,
      data: toStatusDto(job),
    };
  }

  /** GET /api/files/:id/ai/index/status */
  async getIndexStatus(userId: number, fileId: number) {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { id: true },
    });

    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }

    const job = await this.prisma.documentIndexJob.findUnique({
      where: { userFileId: fileId },
    });

    if (!job) {
      return {
        success: true,
        data: {
          status: 'none' as const,
          mode: null,
          summaryGenre: null,
          progress: 0,
          progressMsg: null,
          chunkCount: 0,
          errorMessage: null,
          updatedAt: null,
        },
      };
    }

    return {
      success: true,
      data: toStatusDto(job),
    };
  }
}
