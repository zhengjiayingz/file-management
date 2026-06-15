import '../loadEnv.js';

import { Queue, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

export const PREVIEW_QUEUE_NAME = 'preview-convert';    //队列名
export const PREVIEW_JOB_NAME = 'convert';              //Job名

export type PreviewConvertOp = 'impress-partial' | 'full'; // ppt前n页预览，和全文预览
// 入队载荷
export type PreviewConvertJobData = {
  op: PreviewConvertOp; // 操作类型 前n页 / 全文
  fileHash: string;
  sourceFilePath: string;
  /** true = 后台全文，无 HTTP 在等 */
  isBackground?: boolean;
};
// Worker 返回值：生成 PDF 路径 + 阶段 full / partial
export type PreviewConvertJobResult = {
  path: string;
  phase: 'full' | 'partial';
};
// 任务状态类型。BullMQ job 可能的状态；missing 是本项目自定义的「Redis 里找不到这条 job」
export type PreviewJobState =
  | 'missing'
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'prioritized'
  | 'unknown';
// Redis 连接
function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL 未配置，预览队列不可用');
  }
  return {
    url,
    maxRetriesPerRequest: null,
  };
}
// 单例变量 进程内 懒加载单例：一个 Queue、一个 QueueEvents，避免重复建连接。
let previewQueue: Queue<PreviewConvertJobData, PreviewConvertJobResult> | null = null;
let previewQueueEvents: QueueEvents | null = null;
// 队列是否可用。只判断环境变量有没有配，不 ping Redis；preview.service 在转码前用来快速失败。
export function isPreviewQueueAvailable(): boolean {
  return Boolean(process.env.REDIS_URL);
}
// 创建 Queue（生产者）
export function getPreviewQueue(): Queue<PreviewConvertJobData, PreviewConvertJobResult> {
  if (!previewQueue) {
    //首次调用才new Queue
    previewQueue = new Queue<PreviewConvertJobData, PreviewConvertJobResult>(PREVIEW_QUEUE_NAME, {
      connection: getConnection(), // 绑定 Redis 连接
      defaultJobOptions: { // 默认 job 选项（后面 add 可覆盖）
        attempts: 3, // 最多重试 3 次
        backoff: { type: 'exponential', delay: 5000 }, //失败后退避：指数退避，首次间隔 5 秒
        removeOnComplete: { count: 200 }, // 完成后只保留最近 200 条完成记录
        removeOnFail: { count: 100 }, // 失败记录保留 100 条
      },
    });
  }
  return previewQueue; // 返回单例 Queue
}
// 等完成用
function getPreviewQueueEvents(): QueueEvents {
  if (!previewQueueEvents) {
    previewQueueEvents = new QueueEvents(PREVIEW_QUEUE_NAME, {
      connection: getConnection(),
    });
  }
  return previewQueueEvents;
}
// 构建job ID
export function buildPreviewJobId(fileHash: string, op: PreviewConvertOp): string {
  return `${fileHash}-${op}`;
}
// 入队
export async function enqueuePreviewJob(data: PreviewConvertJobData) {
  const queue = getPreviewQueue(); // 拿生产者 Queue
  return queue.add(PREVIEW_JOB_NAME, data, { // add(任务名, 数据, 选项)
    jobId: buildPreviewJobId(data.fileHash, data.op), // 固定 jobId，同文件同 op 不会重复排队
    priority: data.isBackground ? 10 : 1, // 数字 越小优先级越高：用户等的 partial/full 为 1；后台全文为 10，让快览先跑
  });
}
// async 函数：在 waitUntilFinished 完成前，调用它的 HTTP 请求会一直挂着
// 根据 jobId 取出已经入队的 job，然后一直等到 Worker 把它跑完,这个函数本身不执行任务。
export async function waitPreviewJobFinished(
  jobId: string,
  timeoutMs = 240_000, // 默认最多等 240 秒（4 分钟），超时抛错
): Promise<PreviewConvertJobResult> {
  const queue = getPreviewQueue();  // 获取（或懒创建）名为 preview-convert 的 BullMQ Queue 实例。
  const job = await queue.getJob(jobId); // 从 Redis 里取出这条 job 的句柄（Job 对象）
  if (!job) {
    throw new Error(`预览任务不存在: ${jobId}`);
  }
  // 这是 BullMQ 提供的 API，做三件事：1. 订阅队列事件 getPreviewQueueEvents() 返回单例 QueueEvents，
  // 连同一 Redis、同一队列名 preview-convert，监听 completed / failed 等事件
  //2.等待该 job 终态
  const result = await job.waitUntilFinished(getPreviewQueueEvents(), timeoutMs);
  return result as PreviewConvertJobResult;
}
// 查询 job 状态
export async function getPreviewJobState(
  fileHash: string,
  op: PreviewConvertOp,
): Promise<PreviewJobState> {
  const job = await getPreviewQueue().getJob(buildPreviewJobId(fileHash, op)); // 用 fileHash-op 查 job
  if (!job) return 'missing';// 没有这条 job → 'missing'
  const state = await job.getState();
  return state as PreviewJobState; // 否则返回 BullMQ 状态：waiting、active、completed 等
}
//优雅关闭
// Worker 收到 SIGINT/SIGTERM 时调用，关掉 Redis 订阅和 Queue，释放连接；
// 单例置 null 便于测试或重启。
export async function closePreviewQueue(): Promise<void> {
  await previewQueueEvents?.close();
  await previewQueue?.close();
  previewQueueEvents = null;
  previewQueue = null;
}
