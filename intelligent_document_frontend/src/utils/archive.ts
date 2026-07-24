/** 常见压缩包扩展名（用于识别「压缩包」双击逻辑） */
export function isArchiveFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (/\.tar\.gz$|\.tgz$/i.test(fileName)) return true
  return /\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(lower)
}

/** 后端当前支持在线解压的格式（与 archiveExtract.controller 一致） */
export function isZipExtractableOnline(file: string | { fileName: string; mimeType?: string }): boolean {
  const name = typeof file === 'string' ? file : file.fileName
  const mime = (typeof file === 'string' ? '' : file.mimeType || '').toLowerCase()
  if (/\.(zip|jar|war|ear)$/i.test(name)) return true
  return /^application\/(zip|x-zip-compressed)/i.test(mime)
}

/** VIP 或管理员可使用在线解压到网盘 */
export function canUseOnlineArchiveExtract(user: { role: string } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'vip' || user.role === 'admin'
}
