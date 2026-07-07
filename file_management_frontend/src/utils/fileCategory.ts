import type { FileItem } from '@typing/file'
import { isAudioMedia, isVideoMedia } from './mediaFileDetect'

/** 与筛选「类型」一致：文件夹 + MIME 大类 */
export type FileEntryCategory = 'folder' | 'image' | 'video' | 'audio' | 'document' | 'other'

const CATEGORY_ORDER: Record<FileEntryCategory, number> = {
  folder: 0,
  image: 1,
  video: 2,
  audio: 3,
  document: 4,
  other: 5
}

/**
 * 推断条目类型（与后端 type 筛选、列表图标逻辑一致，含扩展名兜底）
 */
export function getFileEntryCategory(file: FileItem): FileEntryCategory {
  if (file.fileType === 'folder') return 'folder'

  const mime = (file.mimeType || '').toLowerCase()
  const name = file.fileName

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) {
    return 'image'
  }
  if (isAudioMedia({ mimeType: mime, fileName: name })) {
    return 'audio'
  }
  if (isVideoMedia({ mimeType: mime, fileName: name })) {
    return 'video'
  }
  if (
    mime.startsWith('text/') ||
    /pdf|word|excel|sheet|powerpoint|presentation|document/.test(mime) ||
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv)$/i.test(name)
  ) {
    return 'document'
  }
  return 'other'
}

export function compareFileEntryCategory(a: FileEntryCategory, b: FileEntryCategory): number {
  return CATEGORY_ORDER[a] - CATEGORY_ORDER[b]
}
