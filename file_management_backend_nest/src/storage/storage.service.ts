import { Injectable } from '@nestjs/common';
import { LocalStorageProvider } from './local.provider';
import { MinioStorageProvider } from './minio.provider';
import type { StorageDriver, StorageProvider } from './types';

@Injectable()
export class StorageService {
  private cached: StorageProvider | null = null;

  getStorageDriver(): StorageDriver {
    const raw = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
    return raw === 'minio' ? 'minio' : 'local';
  }

  getStorageProvider(): StorageProvider {
    if (this.cached) return this.cached;
    this.cached =
      this.getStorageDriver() === 'minio'
        ? new MinioStorageProvider()
        : new LocalStorageProvider();
    return this.cached;
  }
}
