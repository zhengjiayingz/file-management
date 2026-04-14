import { CHUNK_SIZE } from '@/utils/chunkConstants'
import {
  calculateChunkHashInWorker,
  calculateFileHashInWorker,
} from '@/utils/hashWorkerClient'

// 分片大小（从 chunkConstants 导出，保持对外 API 不变）
export { CHUNK_SIZE }

// 支持的文件类型
export const SUPPORTED_FILE_TYPES = {
  // 图片
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],

  // 文档
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],

  // 压缩文件
  'application/zip': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/x-7z-compressed': ['.7z'],

  // 音频
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],

  // 视频
  'video/mp4': ['.mp4'],
  'video/avi': ['.avi'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'application/vnd.rn-realmedia': ['.rmvb'],
  'application/vnd.rn-realmedia-vbr': ['.rmvb'],
}

// 文件验证
export interface FileValidationResult {
  valid: boolean
  error?: string
}

export function validateFile(file: File): FileValidationResult {
  // 检查文件大小（最大2GB）
  const maxSize = 2 * 1024 * 1024 * 1024 // 2GB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: '文件大小不能超过2GB',
    }
  }

  // 检查文件类型
  const extension = '.' + file.name.split('.').pop()?.toLowerCase()
  const isSupported = Object.values(SUPPORTED_FILE_TYPES).some((exts) =>
    exts.includes(extension),
  )

  if (!isSupported) {
    return {
      valid: false,
      error: '不支持的文件类型',
    }
  }

  return { valid: true }
}

/**
 * 计算文件 MD5（秒传预检），在 Web Worker 中执行 SparkMD5，避免大文件阻塞主线程。
 */
export function calculateFileHash(file: File): Promise<string> {
  return calculateFileHashInWorker(file)
}

/**
 * 计算分片 MD5（与上传参数一致），在 Web Worker 中执行。
 * 会读取 Blob 为 ArrayBuffer 并转移给 Worker；上传仍使用原 Blob，不受影响。
 */
export async function calculateChunkHash(chunk: Blob): Promise<string> {
  const buffer = await chunk.arrayBuffer()
  return calculateChunkHashInWorker(buffer)
}

// 创建文件分片
export function createFileChunks(file: File): Blob[] {
  const chunks: Blob[] = []
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    chunks.push(file.slice(start, end))
  }

  return chunks
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取文件图标
export function getFileIcon(mimeType: string, fileName: string): string {
  const extension = '.' + fileName.split('.').pop()?.toLowerCase()

  // 图片文件
  if (mimeType.startsWith('image/')) {
    return 'el-icon-picture'
  }

  // 视频文件
  if (
    mimeType.startsWith('video/') ||
    mimeType.includes('realmedia') ||
    extension === '.rmvb'
  ) {
    return 'el-icon-video-camera'
  }

  // 音频文件
  if (mimeType.startsWith('audio/')) {
    return 'el-icon-headset'
  }

  // 文档文件
  if (mimeType === 'application/pdf') {
    return 'el-icon-document'
  }

  if (mimeType.includes('word') || extension === '.doc' || extension === '.docx') {
    return 'el-icon-document'
  }

  if (mimeType.includes('excel') || extension === '.xls' || extension === '.xlsx') {
    return 'el-icon-s-grid'
  }

  if (mimeType.includes('powerpoint') || extension === '.ppt' || extension === '.pptx') {
    return 'el-icon-present'
  }

  // 压缩文件
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) {
    return 'el-icon-folder-opened'
  }

  // 文本文件
  if (mimeType === 'text/plain') {
    return 'el-icon-document'
  }

  // 默认文件图标
  return 'el-icon-document'
}

// 检查是否为图片文件
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

// 检查是否为视频文件
export function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

// 检查是否可以预览
export function canPreview(mimeType: string): boolean {
  return (
    isImageFile(mimeType) ||
    isVideoFile(mimeType) ||
    mimeType === 'application/pdf' ||
    mimeType === 'text/plain'
  )
}
