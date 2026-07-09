import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentIndexMode, DocumentIndexStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { isIndexableTextDocument } from './chunk/text-extractor';
import { DocumentIndexQueueService } from '@/files/ai/document-index-queue.service';

const ACTIVE_STATUSES: DocumentIndexStatus[] = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'summarizing',
  'extracting_knowledge',
];

function validateIndexMode(body: unknown): DocumentIndexMode {
  if (body == null || typeof body !== 'object') {
    return 'general';
  }
  const mode = (body as { mode?: unknown }).mode;
  if (mode == null) return 'general';
  if (mode === 'general' || mode === 'academic') {
    return mode;
  }
  throw new BadRequestException('mode 必须是 general 或 academic');
}

function toStatusDto(job: {
  status: DocumentIndexStatus;
  progress: number;
  progressMsg: string | null;
  chunkCount: number;
  errorMessage: string | null;
  mode: DocumentIndexMode;
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
    const mode = validateIndexMode(body); // 解析索引模式，general或者academic
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
      throw new BadRequestException('仅支持 UTF-8 编码的 .txt / .md 文件');
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
      existing?.status === 'ready' &&
      existing.indexedFileHash &&
      existing.indexedFileHash === userFile.storage.fileHash
    ) {
      throw new ConflictException('检查到文档未更新，无需重新建立索引');
    }

    // ready（内容已变）/ failed / 无记录 → 允许（重新）索引
    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { userFileId: fileId } }); //删除旧chunk
      // 创建或更新 index job
      await tx.documentIndexJob.upsert({
        where: { userFileId: fileId },
        create: {
          userFileId: fileId,
          mode, // 用户选的 general/academic
          status: 'pending', //等待 Worker 处理
          progress: 0, // 进度 0%
          progressMsg: '已加入队列', // 给前端看的提示
          chunkCount: 0, // 还没切块
          errorMessage: null, // 清掉上次失败信息
        },
        // 更新的时候
        update: {
          mode, // 用户选的 general/academic
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
