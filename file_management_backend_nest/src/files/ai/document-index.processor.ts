import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { DocumentIndexStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { StorageService } from '@/storage/storage.service';
import { chunkText } from './chunk/text-chunker';
import { extractTextFromStorage } from './chunk/text-extractor';
import {
  DOCUMENT_INDEX_JOB_NAME, // 任务名
  DOCUMENT_INDEX_QUEUE_NAME, // 队列名
  type DocumentIndexJobData, // 任务 payload 类型
} from './document-index-queue.types';
import { embedMany } from './embedding/embedding.provider';
import { SummaryMapReduceService } from './summary/summary-map-reduce.service';

//  BullMQ 异步 Worker，负责消费 document-index 队列里的索引任务。用户在前端对某个文件点「建立索引」后，API 只负责入队；真正耗时的活都在这里做
// @Processor 装饰器，第一个参数表示监听DOCUMENT_INDEX_QUEUE_NAME这个队列，约定了队列只要有任务就调用process方法处理
// 所以要实现WorkerHost的process方法，这个方法就是 BullMQ 回调：每个 job 进队后执行
@Processor(DOCUMENT_INDEX_QUEUE_NAME, { concurrency: 1 }) //  表示同一 Worker 同时只跑 1 个索引任务（避免 embedding 打爆 API/内存）
export class DocumentIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentIndexProcessor.name); // 创建带类名的 Logger

  constructor(
    private readonly prisma: PrismaService, // 注入 Prisma
    private readonly storageService: StorageService, // 注入 Storage
    private readonly summaryMapReduce: SummaryMapReduceService,
  ) {
    super();
  }
  // 按 userFileId 更新索引任务记录，可改状态、进度、消息、chunk 数、错误信息
  private async patchJob(
    userFileId: number,
    data: {
      status?: DocumentIndexStatus;
      progress?: number;
      progressMsg?: string;
      chunkCount?: number;
      errorMessage?: string | null;
      indexedFileHash?: string | null;
    },
  ) {
    // 每个文件对应一条 documentIndexJob（主键是 userFileId）
    await this.prisma.documentIndexJob.update({
      where: { userFileId },
      data,
    });
  }
  // BullMQ 回调：每个 job 进队后执行
  async process(job: Job<DocumentIndexJobData>): Promise<void> {
    // 只接受任务名 index，否则抛错
    if (job.name !== DOCUMENT_INDEX_JOB_NAME) {
      throw new Error(`未知索引任务类型: ${job.name}`);
    }
    // 从 payload 解构文件 ID 和用户 ID
    const { userFileId, userId } = job.data;
    this.logger.log(`[document-index] 开始 userFileId=${userFileId}`); // 打开始日志
    // 提取文本
    try {
      //查userFile 且必须 userId 匹配、isDeleted: false，并带上 storage 路径和 MIME
      const userFile = await this.prisma.userFile.findFirst({
        where: { id: userFileId, userId, isDeleted: false },
        select: {
          fileName: true,
          storage: {
            select: { filePath: true, mimeType: true, fileHash: true },
          },
        },
      });
      // 文件或 storage 不存在则失败
      if (!userFile?.storage) {
        throw new Error('文件不存在或 storage 缺失');
      }
      // 更新状态 → extracting，进度 10%，清空旧错误
      await this.patchJob(userFileId, {
        status: 'extracting',
        progress: 10,
        progressMsg: '正在提取文本',
        errorMessage: null,
      });
      // 用 storage provider 读文件，按扩展名/MIME 解析成字符串（PDF、Office、txt 等由 text-extractor 处理）
      const fullText = await extractTextFromStorage(
        this.storageService.getStorageProvider(),
        {
          storedPath: userFile.storage.filePath,
          fileName: userFile.fileName,
          mimeType: userFile.storage.mimeType,
        },
      );
      // 更新状态 → chunking，进度 30%
      await this.patchJob(userFileId, {
        status: 'chunking',
        progress: 30,
        progressMsg: '正在分块',
      });
      // 按固定策略把长文本切成 { index, content }[]
      const chunks = chunkText(fullText);
      if (chunks.length === 0) {
        throw new Error('文档内容为空，无法索引');
      }
      // 重试入队时可能已有半截 chunks（例如 embedding 失败后 BullMQ 再次执行 process）
      await this.prisma.documentChunk.deleteMany({ where: { userFileId } });
      // 批量插入 documentChunk（此时还没有 embedding）
      await this.prisma.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          userFileId,
          chunkIndex: chunk.index,
          content: chunk.content,
        })),
      });
      // 更新状态 → embedding，进度 50%，记录 chunk 总数
      await this.patchJob(userFileId, {
        chunkCount: chunks.length,
        status: 'embedding',
        progress: 50,
        progressMsg: `正在生成向量 0/${chunks.length}`,
      });
      // 一次性把所有 chunk 文本发给 embedding API（比逐条请求更高效）
      const embeddings = await embedMany(chunks.map((c) => c.content));
      // 循环：按 (userFileId, chunkIndex) 更新每条 chunk 的向量；进度从 50% 线性涨到 95%
      for (let i = 0; i < chunks.length; i++) {
        await this.prisma.documentChunk.update({
          where: {
            userFileId_chunkIndex: {
              userFileId,
              chunkIndex: chunks[i].index,
            },
          },
          data: { embedding: embeddings[i] },
        });
        // 每完成一个 chunk 更新 progressMsg，前端可显示「正在生成向量 3/10」
        const done = i + 1;
        await this.patchJob(userFileId, {
          progress: 50 + Math.floor((done / chunks.length) * 45),
          progressMsg: `正在生成向量 ${done}/${chunks.length}`,
        });
      }

      // 1. 进入 summarizing
      await this.patchJob(userFileId, {
        status: 'summarizing',
        progress: 96,
        progressMsg: '正在生成摘要',
      });
      // 2. 从 job.data 取 summaryGenre
      const { summaryGenre } = job.data;
      if (!summaryGenre) {
        throw new Error('缺少 summaryGenre');
      }
      // 3. 从 DB 读 chunks（含 content、chapterNo）
      const dbChunks = await this.prisma.documentChunk.findMany({
        where: { userFileId },
        orderBy: { chunkIndex: 'asc' },
        select: { chunkIndex: true, chapterNo: true, content: true },
      });
      const chunkInputs = dbChunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        chapterNo: c.chapterNo,
        content: c.content,
      }));
      // 4. 跑 Map-Reduce
      await this.summaryMapReduce.runMapReduce(
        userFileId,
        summaryGenre,
        chunkInputs,
      );

      // 成功收尾：状态 → ready，进度 100%
      await this.patchJob(userFileId, {
        status: 'ready',
        progress: 100,
        progressMsg: '索引完成',
        errorMessage: null,
        indexedFileHash: userFile.storage.fileHash,
      });
      // 打成功日志
      this.logger.log(
        `[document-index] 完成 userFileId=${userFileId} chunks=${chunks.length}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '索引失败';
      this.logger.error(
        `[document-index] 失败 userFileId=${userFileId}: ${message}`,
      );

      await this.patchJob(userFileId, {
        status: 'failed',
        progressMsg: '索引失败',
        errorMessage: message,
      }).catch((patchError) => {
        this.logger.error(
          `[document-index] 更新失败状态出错 userFileId=${userFileId}`,
          patchError,
        );
      });

      throw error;
    }
  }
}
