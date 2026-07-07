/** 判断是否为音频（.ogg 在 MIME 为 audio/* 或未知时优先按音频处理） */
export function isAudioMedia(file: {
  mimeType?: string | null
  fileName: string
}): boolean {
  const mime = (file.mimeType || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  if (mime.startsWith('video/')) return false
  return /\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/i.test(file.fileName)
}

/** 判断是否为视频（排除已识别为音频的 .ogg） */
export function isVideoMedia(file: {
  mimeType?: string | null
  fileName: string
}): boolean {
  if (isAudioMedia(file)) return false
  const mime = (file.mimeType || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  return /\.(mp4|webm|ogg|mov|wmv|flv|avi|rmvb|mkv)$/i.test(file.fileName)
}
