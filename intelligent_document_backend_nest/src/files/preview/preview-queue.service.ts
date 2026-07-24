import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import {
  PREVIEW_JOB_NAME,
  PREVIEW_QUEUE_NAME,
  type PreviewConvertJobData,
  type PreviewConvertJobResult,
  type PreviewConvertOp,
  type PreviewJobInfo,
  type PreviewJobState,
} from './preview-queue.types';

@Injectable()
export class PreviewQueueService implements OnModuleDestroy {
  private previewQueue: Queue<
    PreviewConvertJobData,
    PreviewConvertJobResult
  > | null = null;

  private previewQueueEvents: QueueEvents | null = null;

  constructor(private readonly config: ConfigService) {}

  isPreviewQueueAvailable(): boolean {
    return Boolean(this.config.get<string>('REDIS_URL'));
  }

  private getConnection(): ConnectionOptions {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL 未配置，预览队列不可用');
    }
    return {
      url,
      maxRetriesPerRequest: null,
    };
  }

  getPreviewQueue(): Queue<PreviewConvertJobData, PreviewConvertJobResult> {
    if (!this.previewQueue) {
      this.previewQueue = new Queue<
        PreviewConvertJobData,
        PreviewConvertJobResult
      >(PREVIEW_QUEUE_NAME, {
        connection: this.getConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      });
    }
    return this.previewQueue;
  }

  private getPreviewQueueEvents(): QueueEvents {
    if (!this.previewQueueEvents) {
      this.previewQueueEvents = new QueueEvents(PREVIEW_QUEUE_NAME, {
        connection: this.getConnection(),
      });
    }
    return this.previewQueueEvents;
  }

  buildPreviewJobId(
    fileHash: string,
    op: PreviewConvertOp,
    targetSlides?: number,
  ): string {
    if (op === 'impress-partial-more' && targetSlides != null) {
      return `${fileHash}-impress-partial-more-${targetSlides}`;
    }
    return `${fileHash}-${op}`;
  }

  private jobPriority(data: PreviewConvertJobData): number {
    if (data.op === 'full') return data.isBackground ? 15 : 1;
    if (data.op === 'impress-partial-more') return 3;
    return 1;
  }

  async enqueuePreviewJob(data: PreviewConvertJobData) {
    const queue = this.getPreviewQueue();
    const jobId =
      data.op === 'impress-partial-more'
        ? this.buildPreviewJobId(data.fileHash, data.op, data.targetSlides)
        : this.buildPreviewJobId(data.fileHash, data.op);

    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else if (
        state === 'waiting' ||
        state === 'active' ||
        state === 'delayed' ||
        state === 'prioritized'
      ) {
        return existing;
      }
    }

    return queue.add(PREVIEW_JOB_NAME, data, {
      jobId,
      priority: this.jobPriority(data),
    });
  }

  async waitPreviewJobFinished(
    jobId: string,
    timeoutMs = 240_000,
  ): Promise<PreviewConvertJobResult> {
    const job = await this.getPreviewQueue().getJob(jobId);
    if (!job) {
      throw new Error(`预览任务不存在: ${jobId}`);
    }
    const result = await job.waitUntilFinished(
      this.getPreviewQueueEvents(),
      timeoutMs,
    );
    return result;
  }

  async getPreviewJobState(
    fileHash: string,
    op: PreviewConvertOp,
    targetSlides?: number,
  ): Promise<PreviewJobState> {
    const info = await this.getPreviewJobInfo(fileHash, op, targetSlides);
    return info.state;
  }

  async getPreviewJobInfo(
    fileHash: string,
    op: PreviewConvertOp,
    targetSlides?: number,
  ): Promise<PreviewJobInfo> {
    const jobId =
      op === 'impress-partial-more'
        ? this.buildPreviewJobId(fileHash, op, targetSlides)
        : this.buildPreviewJobId(fileHash, op);
    const job = await this.getPreviewQueue().getJob(jobId);
    if (!job) return { state: 'missing' };
    const state = (await job.getState()) as PreviewJobState;
    return {
      state,
      attemptsMade: job.attemptsMade,
      failedReason:
        state === 'failed' ? (job.failedReason ?? undefined) : undefined,
    };
  }

  async onModuleDestroy() {
    await this.previewQueueEvents?.close();
    await this.previewQueue?.close();
    this.previewQueueEvents = null;
    this.previewQueue = null;
  }
}
