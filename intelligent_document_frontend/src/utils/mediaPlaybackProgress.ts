/** localStorage 中按用户 + 文件记录播放进度（秒） */

const STORAGE_PREFIX = 'fm_media_progress_v1'

export function mediaProgressStorageKey(userId: number, fileId: number): string {
  return `${STORAGE_PREFIX}:${userId}:${fileId}`
}

export function loadMediaProgress(userId: number, fileId: number): number | null {
  const raw = localStorage.getItem(mediaProgressStorageKey(userId, fileId))
  if (raw == null) return null
  const n = parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function saveMediaProgress(userId: number, fileId: number, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) return
  localStorage.setItem(mediaProgressStorageKey(userId, fileId), String(seconds))
}

export function clearMediaProgress(userId: number, fileId: number): void {
  localStorage.removeItem(mediaProgressStorageKey(userId, fileId))
}

/** 接近结尾时视为看完，不再保留进度 */
export function shouldClearProgress(currentSec: number, durationSec: number): boolean {
  if (!durationSec || durationSec <= 0 || !Number.isFinite(currentSec)) return false
  return currentSec >= durationSec - 3 || currentSec / durationSec >= 0.98
}
