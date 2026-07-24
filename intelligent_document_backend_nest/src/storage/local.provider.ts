import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureDirectoryExists } from '../files/utils/file.utils';
import {
  getUploadRootDir,
  resolveStorageFilePath,
} from '../files/utils/storagePath.utils';
import type { PutFromLocalFileInput, StorageProvider } from './types';

const renameAsync = promisify(fs.rename);
const unlinkAsync = promisify(fs.unlink);

function buildSafeTargetName(
  suggestedName: string | undefined,
  sourcePath: string,
): string {
  if (suggestedName && suggestedName.trim()) {
    return path.basename(suggestedName.trim());
  }
  return path.basename(sourcePath);
}

export class LocalStorageProvider implements StorageProvider {
  driver = 'local' as const;

  async putFromLocalFile(input: PutFromLocalFileInput): Promise<string> {
    const uploadsDir = getUploadRootDir();
    ensureDirectoryExists(uploadsDir);
    const fileName = buildSafeTargetName(
      input.suggestedName,
      input.localFilePath,
    );
    const targetPath = path.join(uploadsDir, fileName);

    try {
      await renameAsync(input.localFilePath, targetPath);
    } catch {
      fs.copyFileSync(input.localFilePath, targetPath);
      await unlinkAsync(input.localFilePath);
    }

    const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
      .trim()
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');
    return `${uploadRel}/${fileName}`;
  }

  getReadStream(storedPath: string) {
    const absolutePath = resolveStorageFilePath(storedPath);
    return Promise.resolve(fs.createReadStream(absolutePath));
  }

  exists(storedPath: string): Promise<boolean> {
    const absolutePath = resolveStorageFilePath(storedPath);
    return Promise.resolve(fs.existsSync(absolutePath));
  }

  async delete(storedPath: string): Promise<void> {
    const absolutePath = resolveStorageFilePath(storedPath);
    if (fs.existsSync(absolutePath)) {
      await unlinkAsync(absolutePath);
    }
  }
}
