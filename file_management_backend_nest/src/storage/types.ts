import type { Readable } from 'node:stream';

export type StorageDriver = 'local' | 'minio';

export interface PutFromLocalFileInput {
  localFilePath: string;
  suggestedName?: string;
}

export interface StorageProvider {
  driver: StorageDriver;
  putFromLocalFile(input: PutFromLocalFileInput): Promise<string>;
  getReadStream(storedPath: string): Promise<Readable>;
  exists(storedPath: string): Promise<boolean>;
  delete(storedPath: string): Promise<void>;
}
