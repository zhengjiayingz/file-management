import path from 'node:path';

export function getUploadRootDir(): string {
  const raw = (process.env.UPLOAD_PATH || 'uploads').trim();
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(process.cwd(), raw.replace(/^\.\//, ''));
}

export function toStoredRelativePath(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  const norm = resolved.replace(/\\/g, '/');
  const marker = '/chunks/';
  const idx = norm.indexOf(marker);
  if (idx >= 0) {
    return norm.slice(idx + 1);
  }
  const cwdResolved = path.resolve(process.cwd());
  const rel = path.relative(cwdResolved, resolved);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.replace(/\\/g, '/');
  }
  // 统一写成 uploads/<name>，避免把 ../xxx_backend/uploads 写进库导致目录重命名后失效
  const base = path.basename(resolved);
  return path.join('uploads', base).replace(/\\/g, '/');
}

export function resolveStorageFilePath(storedPath: string): string {
  if (!storedPath) return storedPath;
  const normalized = normalizeStoredPath(storedPath).replace(/\\/g, '/');
  if (normalized.startsWith('minio://')) {
    throw new Error('minio 对象路径无法直接解析为本地路径');
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  // 兼容：uploads/x、../旧目录名/uploads/x、../新目录名/uploads/x
  // 一律相对当前 UPLOAD_PATH 根解析
  const marker = 'uploads/';
  const idx = normalized.indexOf(marker);
  if (idx >= 0) {
    return path.join(getUploadRootDir(), normalized.slice(idx + marker.length));
  }

  return path.resolve(process.cwd(), normalized);
}

export function normalizeStoredPath(storedPath: string): string {
  if (!storedPath) return storedPath;
  if (storedPath.startsWith('local://'))
    return storedPath.slice('local://'.length);
  return storedPath;
}
