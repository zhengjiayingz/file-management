import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getUploadRootDir, normalizeStoredPath } from '../utils/storagePath.utils.js';
import { ensureDirectoryExists } from '../utils/file.utils.js';
import type { PutFromLocalFileInput, StorageProvider } from './types.js';

const renameAsync = promisify(fs.rename); // 用于在同一文件系统内移动/重命名文件
const unlinkAsync = promisify(fs.unlink); // 用于删除单个文件
// 根据「建议名」或「源路径」生成安全的目标文件名
function buildSafeTargetName(suggestedName: string | undefined, sourcePath: string): string {
  if (suggestedName && suggestedName.trim()) {
    return path.basename(suggestedName.trim()); // 只取文件名部分，去掉路径
  }
  return path.basename(sourcePath);
}
// 本地存储实现类
export class LocalStorageProvider implements StorageProvider {
  driver = 'local' as const; // 标识驱动类型为本地存储
  // 从本地文件写入存储
  async putFromLocalFile(input: PutFromLocalFileInput): Promise<string> {
    const uploadsDir = getUploadRootDir(); // 据环境变量 UPLOAD_PATH（默认 uploads）得到上传根目录的绝对路径
    ensureDirectoryExists(uploadsDir); // 若目录不存在则创建（含父目录），保证上传目录存在。
    const fileName = buildSafeTargetName(input.suggestedName, input.localFilePath); // 根据传入的参数构建文件名
    const targetPath = path.join(uploadsDir, fileName); // 构建目标文件的绝对路径
    try {
      await renameAsync(input.localFilePath, targetPath); // 先尝试用 rename 移动文件（同盘时快且省空间）。
    } catch {
      fs.copyFileSync(input.localFilePath, targetPath); // 跨盘时rename不可用，用复制
      await unlinkAsync(input.localFilePath); // 复制完成后删除源文件
    }
    const uploadRel = (process.env.UPLOAD_PATH || 'uploads').trim().replace(/^\.\//, '').replace(/\\/g, '/');// 构造要写入数据库的相对路径前缀
    return `${uploadRel}/${fileName}`;
  }
 // 根据存储路径返回可读流，用于下载、预览等，避免一次性把整个文件读进内存。
  async getReadStream(storedPath: string) {
    const normalized = normalizeStoredPath(storedPath); // 标准化路径（去 local:// 等前缀）
    const absolutePath = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized); //转绝对路径（相对项目工作目录解析）
    return fs.createReadStream(absolutePath);
  }
 // 判断文件是否存在
  async exists(storedPath: string): Promise<boolean> {
    const normalized = normalizeStoredPath(storedPath);
    const absolutePath = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
    return fs.existsSync(absolutePath);
  }
  // 删除文件
  async delete(storedPath: string): Promise<void> {
    const normalized = normalizeStoredPath(storedPath);
    const absolutePath = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
    if (fs.existsSync(absolutePath)) {
      await unlinkAsync(absolutePath);
    }
  }
}
