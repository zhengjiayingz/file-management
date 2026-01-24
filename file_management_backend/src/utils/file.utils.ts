import fs from 'fs';
import crypto from 'crypto';

/**
 * 计算文件 MD5 哈希
 */
export const calculateFileHash = (filePath: string): string => {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
};

/**
 * 确保目录存在
 */
export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};
