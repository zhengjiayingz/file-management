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
  const uploadRel = (process.env.UPLOAD_PATH || 'uploads')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
  const base = path.basename(resolved);
  if (!path.isAbsolute((process.env.UPLOAD_PATH || 'uploads').trim())) {
    return `${uploadRel}/${base}`;
  }
  return path.join('uploads', base).replace(/\\/g, '/');
}

export function resolveStorageFilePath(storedPath: string): string {
  if (!storedPath) return storedPath;
  const normalized = normalizeStoredPath(storedPath);
  if (normalized.startsWith('minio://')) {
    throw new Error('minio 对象路径无法直接解析为本地路径');
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  // Express 入库为 uploads/<fileName>，应相对 UPLOAD_PATH 根目录解析，而非 Nest cwd/uploads
  if (normalized.startsWith('uploads/')) {
    return path.join(getUploadRootDir(), normalized.slice('uploads/'.length));
  }

  return path.resolve(process.cwd(), normalized);
}

export function normalizeStoredPath(storedPath: string): string {
  if (!storedPath) return storedPath;
  if (storedPath.startsWith('local://'))
    return storedPath.slice('local://'.length);
  return storedPath;
}
