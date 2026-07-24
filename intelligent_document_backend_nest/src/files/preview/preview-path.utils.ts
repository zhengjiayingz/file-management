import path from 'node:path';

/** 与 Express Worker 共用预览缓存目录（默认 ../file_management_backend/previews） */
export function getPreviewsRootDir(): string {
  const raw = (
    process.env.PREVIEWS_PATH || '../file_management_backend/previews'
  ).trim();
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(process.cwd(), raw.replace(/^\.\//, ''));
}
