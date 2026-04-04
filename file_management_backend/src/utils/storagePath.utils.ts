import path from 'path';

/** 本机上传根目录（.env UPLOAD_PATH，相对则相对 process.cwd()） */
export function getUploadRootDir(): string {
  const raw = (process.env.UPLOAD_PATH || 'uploads').trim();
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(process.cwd(), raw.replace(/^\.\//, ''));
}

/**
 * 绝对路径转为写入库的相对路径（正斜杠），含 chunks/... 与 uploads/... 规则。
 */
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

/** 库中路径 → 本机绝对路径（相对则基于 process.cwd） */
export function resolveStorageFilePath(storedPath: string): string {
  if (!storedPath) return storedPath;
  return path.resolve(process.cwd(), storedPath);
}
