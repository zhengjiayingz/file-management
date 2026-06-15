import '../loadEnv.js'; // 加载 .env（含 REDIS_URL）

import { Worker } from 'bullmq'; // Worker：BullMQ 的消费者，从 Redis 拉任务并执行。
import type { ConnectionOptions } from 'bullmq';

import { logger } from '../lib/logger.js';
import {
  PREVIEW_QUEUE_NAME,
  PREVIEW_JOB_NAME,
  closePreviewQueue,
  type PreviewConvertJobData,
  type PreviewConvertJobResult,
} from '../queues/preview.queue.js';
import { processPreviewConvertJob } from '../services/preview.service.js';

function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL 未配置，无法启动预览 Worker');
  }
  return {
    url,
    maxRetriesPerRequest: null,
  };
}
// 创建 Worker（消费核心）
const worker = new Worker<PreviewConvertJobData, PreviewConvertJobResult>(
  PREVIEW_QUEUE_NAME,
   // 回调：每 dequeue 一条任务就执行一次，出队动作在BullMQ自动操作，
   // 这里的回调是BullMQ进行出队后会给你一个job参数，你规定对这个job怎么进行操作，
   // 出队后BullMQ调用你定义的函数对job进行操作
  async (job) => { 
    if (job.name !== PREVIEW_JOB_NAME) {
      throw new Error(`未知预览任务类型: ${job.name}`);
    }
    logger.info(
      { jobId: job.id, op: job.data.op, fileHash: job.data.fileHash },
      '[preview-worker] 开始处理',
    );
    const result = await processPreviewConvertJob(job.data);
    logger.info(
      { jobId: job.id, op: job.data.op, fileHash: job.data.fileHash, phase: result.phase },
      '[preview-worker] 处理完成',
    );
    return result;
  },
  {
    connection: getConnection(),
    concurrency: 1,
  },
);

worker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, op: job?.data?.op, fileHash: job?.data?.fileHash, err },
    '[preview-worker] 任务失败',
  );
});

worker.on('error', (err) => {
  logger.error({ err }, '[preview-worker] Worker 异常');
});

async function shutdown(signal: string) {
  logger.info({ signal }, '[preview-worker] 正在关闭');
  await worker.close();
  await closePreviewQueue();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

logger.info('[preview-worker] 已启动，等待预览转码任务…');
