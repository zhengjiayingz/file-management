import type { FileItem } from '@typing/file'
import { isArchiveFile } from './archive'

/** 与 file-type-icons.js 中 symbol id 一致：icon-{name} */
export type FileTypeSymbolId = 'word' | 'excel' | 'ppt' | 'pdf' | 'archive'

/**
 * 文件列表用：iconfont 多色 SVG Symbol 的 id 后缀（需全局引入 file-type-icons.js）
 */
export function getFileTypeSymbolId(file: FileItem): FileTypeSymbolId | null {
  if (file.fileType === 'folder') return null
  const name = file.fileName
  if (/\.(doc|docx)$/i.test(name)) return 'word'
  if (/\.(xls|xlsx)$/i.test(name)) return 'excel'
  if (/\.(ppt|pptx)$/i.test(name)) return 'ppt'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (isArchiveFile(name)) return 'archive'
  return null
}
