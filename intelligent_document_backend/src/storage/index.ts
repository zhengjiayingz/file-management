import { LocalStorageProvider } from './local.provider.js';
import { MinioStorageProvider } from './minio.provider.js';
import type { StorageDriver, StorageProvider } from './types.js';

let cached: StorageProvider | null = null;

export function getStorageDriver(): StorageDriver {
  const raw = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  return raw === 'minio' ? 'minio' : 'local';
}

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  cached = getStorageDriver() === 'minio' ? new MinioStorageProvider() : new LocalStorageProvider();
  return cached;
}
