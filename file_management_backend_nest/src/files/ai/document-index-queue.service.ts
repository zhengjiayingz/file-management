import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import {
  DOCUMENT_INDEX_JOB_NAME,
  DOCUMENT_INDEX_QUEUE_NAME,
  type DocumentIndexJobData,
} from './document-index-queue.types';

@Injectable()
export class DocumentIndexQueueService implements OnModuleDestroy {
  private queue: Queue<DocumentIndexJobData> | null = null;

  constructor(private readonly config: ConfigService) {}

  private getConnection(): ConnectionOptions {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL 未配置，文档索引队列不可用');
    }
    return { url, maxRetriesPerRequest: null };
  }

  private getQueue(): Queue<DocumentIndexJobData> {
    if (!this.queue) {
      this.queue = new Queue<DocumentIndexJobData>(DOCUMENT_INDEX_QUEUE_NAME, {
        connection: this.getConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      });
    }
    return this.queue;
  }

  async enqueueDocumentIndex(data: DocumentIndexJobData) {
    const jobId = `document-index-${data.userFileId}`;
    const queue = this.getQueue();
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

    return queue.add(DOCUMENT_INDEX_JOB_NAME, data, { jobId });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    this.queue = null;
  }
}
