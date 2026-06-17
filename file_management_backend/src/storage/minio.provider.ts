import fs from 'fs';
import { Client } from 'minio'; // 引入 MinIO 官方 SDK 的 Client 类，用于连接 MinIO 服务并执行上传、下载、删除等操作
import type { PutFromLocalFileInput, StorageProvider } from './types.js';
import { normalizeStoredPath } from '../utils/storagePath.utils.js';

function getRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} 未配置，无法使用 MinIO 存储`);
  return value;
}
// 工厂函数，根据环境变量创建并返回 MinIO Client 实例
function buildMinioClient(): Client {
  return new Client({
    endPoint: getRequiredEnv('MINIO_ENDPOINT', '127.0.0.1'),
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true', // 是否用 HTTPS。只有环境变量为 'true'（不区分大小写）时才启用 SSL
    accessKey: getRequiredEnv('MINIO_ACCESS_KEY', 'minioadmin'), // 访问密钥，MinIO 默认常为 minioadmin。
    secretKey: getRequiredEnv('MINIO_SECRET_KEY', 'minioadmin'), // 秘密密钥，与 accessKey 配对认证。
  });
}
// 把数据库/业务里的「存储路径」转成 MinIO 里的对象键（object key）
function normalizeObjectKey(storedPath: string): string {
  const norm = normalizeStoredPath(storedPath); // 标准化路径（去 minio:// 等前缀）
  if (norm.startsWith('minio://')) return norm.slice('minio://'.length); // 若以 minio:// 开头，去掉该前缀，得到纯对象键，例如 minio://docs/a.pdf → docs/a.pdf
  if (norm.startsWith('/')) return norm.slice(1); // 若以 / 开头，去掉首个斜杠，避免键名以 / 开头（MinIO/S3 里通常不需要）。
  return norm;
}

export class MinioStorageProvider implements StorageProvider {
  driver = 'minio' as const;
  private client = buildMinioClient();
  private bucket = getRequiredEnv('MINIO_BUCKET', 'file-management'); // 存储桶名，默认桶名 file-management，可通过 MINIO_BUCKET 覆盖
  private ready = false; // 标记桶是否已检查/创建。避免每次操作都调 bucketExists

  private async ensureBucket(): Promise<void> {
    if (this.ready) return;
    const exists = await this.client.bucketExists(this.bucket); // 异步检查桶是否存在。
    if (!exists) { // 若桶不存在，则创建桶。创建桶，区域默认 us-east-1
      await this.client.makeBucket(this.bucket, process.env.MINIO_REGION || 'us-east-1');
    }
    this.ready = true;
  }
 // 上传本地文件到 MinIO
  async putFromLocalFile(input: PutFromLocalFileInput): Promise<string> {
    await this.ensureBucket();
    const key = (input.suggestedName || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/\\/g, '/'); // 生成对象key
    await this.client.fPutObject(this.bucket, key, input.localFilePath); // 从本地文件路径上传到指定桶和键
    if (fs.existsSync(input.localFilePath)) { // 上传后检查本地临时文件是否还在。
      fs.unlinkSync(input.localFilePath); // 删除本地文件
    }
    return `minio://${key}`; // 返回如 minio://report.pdf` 的路径，写入数据库，便于区分存储后端。
  }
 // 根据存储路径从 MinIO 取对象，返回可读流（下载/预览）
  async getReadStream(storedPath: string) {
    await this.ensureBucket(); // 确保桶已就绪
    const key = normalizeObjectKey(storedPath); // 把 minio://xxx 或普通路径转成对象键。
    return this.client.getObject(this.bucket, key); // 从桶中按 key 取对象流；SDK 返回的是 Stream，符合 StorageProvider 的 Readable 约定。
  }
  // 检查 MinIO 中对应对象是否存在
  async exists(storedPath: string): Promise<boolean> {
    await this.ensureBucket();
    const key = normalizeObjectKey(storedPath); // 解析对象键
    try {
      await this.client.statObject(this.bucket, key); // 用 statObject 查元数据；获取对象 stat（大小、修改时间等），能成功说明对象存在。
      return true;
    } catch {
      return false;
    }
  }
  // 从 MinIO 删除指定对象
  async delete(storedPath: string): Promise<void> {
    await this.ensureBucket();
    const key = normalizeObjectKey(storedPath);
    try {
      await this.client.removeObject(this.bucket, key);
    } catch {
      // ignore
    }
  }
}
