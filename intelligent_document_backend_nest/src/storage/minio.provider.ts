import fs from 'node:fs';
import { Client } from 'minio';
import { normalizeStoredPath } from '../files/utils/storagePath.utils';
import type { PutFromLocalFileInput, StorageProvider } from './types';

function getRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} 未配置，无法使用 MinIO 存储`);
  return value;
}

function buildMinioClient(): Client {
  return new Client({
    endPoint: getRequiredEnv('MINIO_ENDPOINT', '127.0.0.1'),
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true',
    accessKey: getRequiredEnv('MINIO_ACCESS_KEY', 'minioadmin'),
    secretKey: getRequiredEnv('MINIO_SECRET_KEY', 'minioadmin'),
  });
}

function normalizeObjectKey(storedPath: string): string {
  const norm = normalizeStoredPath(storedPath);
  if (norm.startsWith('minio://')) return norm.slice('minio://'.length);
  if (norm.startsWith('/')) return norm.slice(1);
  return norm;
}

export class MinioStorageProvider implements StorageProvider {
  driver = 'minio' as const;
  private readonly client = buildMinioClient();
  private readonly bucket = getRequiredEnv('MINIO_BUCKET', 'file-management');
  private ready = false;

  private async ensureBucket(): Promise<void> {
    if (this.ready) return;
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(
        this.bucket,
        process.env.MINIO_REGION || 'us-east-1',
      );
    }
    this.ready = true;
  }

  async putFromLocalFile(input: PutFromLocalFileInput): Promise<string> {
    await this.ensureBucket();
    const key = (
      input.suggestedName ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
    ).replace(/\\/g, '/');
    await this.client.fPutObject(this.bucket, key, input.localFilePath);
    if (fs.existsSync(input.localFilePath)) {
      fs.unlinkSync(input.localFilePath);
    }
    return `minio://${key}`;
  }

  async getReadStream(storedPath: string) {
    await this.ensureBucket();
    const key = normalizeObjectKey(storedPath);
    return this.client.getObject(this.bucket, key);
  }

  async exists(storedPath: string): Promise<boolean> {
    await this.ensureBucket();
    const key = normalizeObjectKey(storedPath);
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

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
