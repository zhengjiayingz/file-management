import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureDirectoryExists } from '@/files/utils/file.utils';
import { getUploadRootDir } from '@/files/utils/storagePath.utils';
import type { StorageProvider } from '@/storage/types';

const renameAsync = promisify(fs.rename);
const unlinkAsync = promisify(fs.unlink);

/**
 * 将 multer 临时文件写入 math-temp 前缀，返回 storageKey（不进 UserFile）。
 * 本地盘 key 必须与 LocalStorageProvider 一致：`${UPLOAD_PATH}/math-temp/{userId}/{leaf}`。
 * 不可用 toStoredRelativePath：当 UPLOAD_PATH 在 cwd 外（如 ../xxx/uploads）时，
 * 该工具会退化成「仅 basename」，丢掉 math-temp/{userId} 导致读图 410。
 */
export async function putMathTempFile(input: {
  storage: StorageProvider;
  userId: number;
  localFilePath: string;
  ext: string;
}): Promise<string> {
  const uuid = randomUUID();
  const safeExt = input.ext.startsWith('.') ? input.ext : `.${input.ext}`;
  const leaf = `${uuid}${safeExt}`;
  const nestedRel = `math-temp/${input.userId}/${leaf}`;

  if (input.storage.driver === 'local') {
    const absTarget = path.join(getUploadRootDir(), 'math-temp', String(input.userId), leaf);
    ensureDirectoryExists(path.dirname(absTarget));
    try {
      await renameAsync(input.localFilePath, absTarget);
    } catch {
      fs.copyFileSync(input.localFilePath, absTarget);
      await unlinkAsync(input.localFilePath);
    }
    const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
      .trim()
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');
    return `${uploadRel}/${nestedRel}`;
  }

  return input.storage.putFromLocalFile({
    localFilePath: input.localFilePath,
    suggestedName: nestedRel,
  });
}

export function mathTempTtlHours(): number {
  const n = Number(process.env.AI_MATH_TEMP_TTL_HOURS ?? '24');
  return Number.isFinite(n) && n > 0 ? n : 24;
}
