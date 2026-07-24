/** 缩略图 URL 版本号：路径修复后 bump，避免浏览器继续用缓存的 404 响应 */
const THUMBNAIL_URL_VERSION = '2'

export function buildFileThumbnailUrl(fileId: number, token: string): string {
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const q = new URLSearchParams({
    token: token || '',
    tv: THUMBNAIL_URL_VERSION,
  })
  return `${API_BASE_URL}/api/files/${fileId}/thumbnail?${q.toString()}`
}
