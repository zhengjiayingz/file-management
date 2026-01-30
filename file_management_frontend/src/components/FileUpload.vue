<template>
  <div class="file-upload">
    <!-- 上传按钮 -->
    <button class="upload-button" :class="{ 'is-loading': isUploading }" @click="triggerFileSelect"
      :disabled="isUploading">
      <el-icon v-if="isUploading" class="is-loading">
        <Loading />
      </el-icon>
      <el-icon v-else>
        <Upload />
      </el-icon>
      <span>{{ isUploading ? t('fileUpload.uploading') : t('fileUpload.uploadFile') }}</span>
    </button>

    <!-- 隐藏的文件输入框 -->
    <input ref="fileInputRef" type="file" multiple style="display: none" @change="handleFileSelect"
      :accept="acceptedTypes" />

    <!-- 拖拽上传区域 -->
    <div v-if="showDropZone" class="drop-zone" :class="{ 'drag-over': isDragOver }" @drop="handleDrop"
      @dragover="handleDragOver" @dragenter="handleDragEnter" @dragleave="handleDragLeave">
      <el-icon class="drop-icon" size="48">
        <Upload />
      </el-icon>
      <p class="drop-text">{{ t('fileUpload.dropZoneText') }}</p>
      <p class="drop-hint">{{ t('fileUpload.dropZoneHint') }}</p>
    </div>

    <!-- 上传队列 -->
    <div v-if="uploadQueue.length > 0" class="upload-queue">
      <div class="queue-header">
        <h4>{{ t('fileUpload.queueTitle') }} ({{ uploadQueue.length }})</h4>
        <el-button size="small" type="danger" @click="clearQueue" :disabled="isUploading">
          {{ t('fileUpload.clearQueue') }}
        </el-button>
      </div>

      <div class="queue-list">
        <div v-for="item in uploadQueue" :key="item.id" class="queue-item"
          :class="{ 'uploading': item.status === 'uploading' }">
          <div class="file-info">
            <div class="file-icon-wrapper">
              <img v-if="item.previewUrl" :src="item.previewUrl" class="file-preview-img" alt="preview" />
              <el-icon v-else class="file-icon">
                <Document />
              </el-icon>
            </div>
            <div class="file-details">
              <div class="file-name">{{ item.file.name }}</div>
              <div class="file-size">{{ formatFileSize(item.file.size) }}</div>
            </div>
          </div>

          <div class="upload-progress">
            <div class="progress-info">
              <span class="status-text">{{ getStatusText(item) }}</span>
              <span v-if="item.status === 'uploading'" class="progress-percent">
                {{ item.progress.toFixed(2) }}%
              </span>
            </div>

            <el-progress v-if="item.status === 'uploading' || item.status === 'completed' || item.status === 'error'"
              :percentage="item.progress" :status="item.status === 'completed' ? 'success' :
                item.status === 'error' ? 'exception' : undefined" :stroke-width="4" />
            <div v-if="item.status === 'uploading' && item.remainingTimeStr" class="remaining-time">
              {{ t('fileUpload.remaining') }} {{ item.remainingTimeStr }}
            </div>
          </div>

          <div class="upload-actions">
            <el-button v-if="item.status === 'waiting' || item.status === 'paused'" size="small" type="primary"
              @click="startUpload(item)">
              {{ t('fileUpload.start') }}
            </el-button>

            <el-button v-if="item.status === 'uploading'" size="small" @click="pauseUpload(item)">
              {{ t('fileUpload.pause') }}
            </el-button>

            <el-button v-if="item.status === 'paused'" size="small" type="primary" @click="resumeUpload(item)">
              {{ t('fileUpload.resume') }}
            </el-button>

            <el-button size="small" type="danger" @click="removeFromQueue(item.id)"
              :disabled="item.status === 'uploading'">
              {{ t('fileUpload.remove') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, Document, Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import fileApiService from '../api/file'
import {
  validateFile,
  calculateFileHash,
  calculateChunkHash,
  createFileChunks,
  formatFileSize,
  CHUNK_SIZE,
  SUPPORTED_FILE_TYPES
} from '../utils/fileUpload'

const { t } = useI18n()

// Props
interface Props {
  parentId?: number
  showDropZone?: boolean
  maxFiles?: number
  interceptImage?: boolean // 新增：是否拦截图片上传
}

const props = withDefaults(defineProps<Props>(), {
  showDropZone: true,
  maxFiles: 10,
  interceptImage: false
})

// Emits
const emit = defineEmits<{
  uploadSuccess: [file: any]
  uploadError: [error: string]
  queueChange: [count: number]
  selectImage: [file: File] // 新增：选择图片时触发
}>()

// 上传队列项
interface UploadQueueItem {
  id: string
  file: File
  status: 'waiting' | 'uploading' | 'paused' | 'completed' | 'error'
  progress: number
  fileHash?: string
  chunks?: Blob[]
  uploadedChunks?: number[]
  currentChunk?: number
  error?: string
  abortController?: AbortController
  startTime?: number
  remainingTimeStr?: string
  previewUrl?: string
}

// 响应式数据
const fileInputRef = ref<HTMLInputElement>()
const uploadQueue = ref<UploadQueueItem[]>([])
const isDragOver = ref(false)
const isUploading = ref(false)

// 计算属性
const acceptedTypes = computed(() => {
  return Object.values(SUPPORTED_FILE_TYPES).flat().join(',')
})

// 触发文件选择
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files) {
    addFilesToQueue(Array.from(target.files))
    target.value = '' // 清空input，允许重复选择同一文件
  }
}

// 拖拽处理
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
}

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false

  if (event.dataTransfer?.files) {
    addFilesToQueue(Array.from(event.dataTransfer.files))
  }
}

// 添加文件到队列
const addFilesToQueue = (files: File[]) => {
  // 检查队列数量限制
  if (uploadQueue.value.length + files.length > props.maxFiles) {
    ElMessage.warning(`最多只能同时上传 ${props.maxFiles} 个文件`)
    return
  }

  const validFiles: File[] = []

  for (const file of files) {
    // 验证文件
    const validation = validateFile(file)
    if (!validation.valid) {
      ElMessage.error(`${file.name}: ${validation.error}`)
      continue
    }

    // 检查是否已在队列中
    const exists = uploadQueue.value.some(item =>
      item.file.name === file.name && item.file.size === file.size
    )

    if (exists) {
      ElMessage.warning(`${file.name} 已在上传队列中`)
      continue
    }

    validFiles.push(file)
  }

  // 添加到队列
  const initialQueueLength = uploadQueue.value.length
  for (const file of validFiles) {
    // 拦截图片上传
    if (props.interceptImage && file.type.startsWith('image/')) {
      emit('selectImage', file)
      continue
    }

    const queueItem: UploadQueueItem = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      file,
      status: 'waiting', // 初始状态确保是 waiting
      progress: 0
    }

    // 生成图片预览
    if (file.type.startsWith('image/')) {
      queueItem.previewUrl = URL.createObjectURL(file)
    }

    uploadQueue.value.push(queueItem)
  }

  emit('queueChange', uploadQueue.value.length)

  if (validFiles.length > 0) {
    // 过滤掉被拦截的图片，只显示添加到队列的文件的消息
    const addedCount = uploadQueue.value.length - initialQueueLength
    if (addedCount > 0) {
      ElMessage.success(`已添加 ${addedCount} 个文件到上传队列`)

      // 自动开始上传第一个文件
      if (!isUploading.value) {
        startNextUpload()
      }
    }
  }
}

// 供父组件手动添加文件（例如裁剪后的图片）
const addFile = (file: File) => {
  // 跳过拦截检查，直接添加
  if (uploadQueue.value.length + 1 > props.maxFiles) {
    ElMessage.warning(`最多只能同时上传 ${props.maxFiles} 个文件`)
    return
  }

  // 验证文件（这里就不再重复 calculateHash 等逻辑，直接走 addFilesToQueue 但需要绕过拦截）
  // 为了简单，我们直接构造 queueItem 并 push，类似 addFilesToQueue

  // 复用逻辑：把这一步封装？或者简单点，我们这里临时把 interceptImage 改一下？不推荐。
  // 我们可以给 addFilesToQueue 加一个参数 bypassIntercept?

  // 或者直接在这里写：
  const queueItem: UploadQueueItem = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    file,
    status: 'waiting',
    progress: 0
  }

  if (file.type.startsWith('image/')) {
    queueItem.previewUrl = URL.createObjectURL(file)
  }

  uploadQueue.value.push(queueItem)
  emit('queueChange', uploadQueue.value.length)
  ElMessage.success('已添加裁剪后图片')

  if (!isUploading.value) {
    startNextUpload()
  }
}

defineExpose({
  addFile
})

/* Old startNextUpload below... */

// 开始下一个上传
const startNextUpload = async () => {
  const waitingItem = uploadQueue.value.find(item => item.status === 'waiting')
  if (waitingItem && !isUploading.value) {
    await startUpload(waitingItem)
  }
}

// 开始上传
const startUpload = async (item: UploadQueueItem) => {
  try {
    isUploading.value = true
    item.status = 'uploading'
    item.progress = 0
    item.abortController = new AbortController()

    // 计算文件哈希
    if (!item.fileHash) {
      item.fileHash = await calculateFileHash(item.file)
    }

    // 检查文件是否已存在（秒传）
    const existsResult = await fileApiService.checkFileExists(item.fileHash)

    if (existsResult.exists) {
      // 秒传
      const fileInfo = await fileApiService.instantUpload(
        item.fileHash,
        item.file.name,
        item.file.size,
        item.file.type || (item.file.name.toLowerCase().endsWith('.rmvb') ? 'application/vnd.rn-realmedia' : 'application/octet-stream'),
        props.parentId
      )

      item.status = 'completed'
      item.progress = 100
      ElMessage.success(`${item.file.name} 秒传成功`)
      emit('uploadSuccess', fileInfo)

      // 3秒后移除完成的项目
      setTimeout(() => {
        removeFromQueue(item.id)
      }, 3000)
    } else {
      // 对于空文件或很小的文件，直接使用传统上传
      if (item.file.size === 0) {
        // 空文件特殊处理：直接创建文件记录
        const fileInfo = await fileApiService.mergeChunks(
          item.fileHash,
          item.file.name,
          item.file.size,
          item.file.type || (item.file.name.toLowerCase().endsWith('.rmvb') ? 'application/vnd.rn-realmedia' : 'application/octet-stream'),
          0, // 空文件的分片数为0
          props.parentId
        )

        item.status = 'completed'
        item.progress = 100
        ElMessage.success(`${item.file.name} 上传成功`)
        emit('uploadSuccess', fileInfo)

        // 3秒后移除完成的项目
        setTimeout(() => {
          removeFromQueue(item.id)
        }, 3000)
      } else {
        // 分片上传
        await uploadWithChunks(item)
      }
    }
  } catch (error: any) {
    item.status = 'error'
    item.error = error.message || '上传失败'
    ElMessage.error(`${item.file.name} 上传失败: ${item.error}`)
    emit('uploadError', item.error || '上传失败')
  } finally {
    if (item.status !== 'paused') {
      isUploading.value = false

      // 继续上传队列中的下一个文件
      setTimeout(() => {
        startNextUpload()
      }, 1000)
    }
  }
}

// 分片上传
const uploadWithChunks = async (item: UploadQueueItem) => {
  if (!item.fileHash) return

  // 创建分片
  if (!item.chunks) {
    item.chunks = createFileChunks(item.file)
  }

  // 获取已上传的分片（断点续传）
  if (!item.uploadedChunks) {
    item.uploadedChunks = await fileApiService.getUploadedChunks(item.fileHash)
  }

  const totalChunks = item.chunks.length
  let uploadedCount = item.uploadedChunks.length

  item.startTime = Date.now()
  // 记录本此会话开始时的已上传量，用于计算瞬时速度
  const startUploadedBytes = (uploadedCount / totalChunks) * item.file.size

  // 上传分片
  for (let i = 0; i < totalChunks; i++) {
    // 检查是否已暂停或取消
    if (item.status !== 'uploading') {
      return
    }

    // 跳过已上传的分片
    if (item.uploadedChunks.includes(i)) {
      continue
    }

    item.currentChunk = i
    const chunk = item.chunks[i]
    if (!chunk) continue

    const chunkHash = await calculateChunkHash(chunk)

    try {
      await fileApiService.uploadChunk(
        item.fileHash,
        i,
        chunk,
        chunkHash,
        (progress) => {
          // 计算总进度
          const chunkProgress = progress.percentage / 100
          const totalProgress = ((uploadedCount + chunkProgress) / totalChunks) * 100
          item.progress = totalProgress

          // 计算剩余时间
          if (item.startTime) {
            const now = Date.now()
            const elapsedTime = (now - item.startTime) / 1000 // s

            // 为了防止初始波动，至少等待1秒或有一定进度后再计算
            if (elapsedTime > 1) {
              const totalBytes = item.file.size
              const currentUploadedBytes = (totalProgress / 100) * totalBytes

              // 计算本此会话产生的上传量
              const sessionUploadedBytes = currentUploadedBytes - startUploadedBytes

              if (sessionUploadedBytes > 0) {
                const speed = sessionUploadedBytes / elapsedTime // bytes/sec
                const remainingBytes = totalBytes - currentUploadedBytes
                if (speed > 0) {
                  const remainingSeconds = Math.ceil(remainingBytes / speed)
                  item.remainingTimeStr = formatRemainingTime(remainingSeconds)
                }
              }
            }
          }
        }
      )

      uploadedCount++
      item.uploadedChunks.push(i)
      item.progress = (uploadedCount / totalChunks) * 100
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return // 用户取消上传
      }
      throw error
    }
  }

  // 清除计时
  item.remainingTimeStr = ''

  // 合并分片
  const fileInfo = await fileApiService.mergeChunks(
    item.fileHash,
    item.file.name,
    item.file.size,
    item.file.type || (item.file.name.toLowerCase().endsWith('.rmvb') ? 'application/vnd.rn-realmedia' : 'application/octet-stream'),
    totalChunks,
    props.parentId
  )

  item.status = 'completed'
  item.progress = 100
  ElMessage.success(`${item.file.name} 上传成功`)
  emit('uploadSuccess', fileInfo)

  // 3秒后移除完成的项目
  setTimeout(() => {
    removeFromQueue(item.id)
  }, 3000)
}

// 暂停上传
const pauseUpload = (item: UploadQueueItem) => {
  if (item) {
    item.status = 'paused'
    item.abortController?.abort()
    isUploading.value = false
  }
}

// 继续上传
const resumeUpload = async (item: UploadQueueItem) => {
  if (item) {
    await startUpload(item)
  }
}

// 从队列中移除
const removeFromQueue = (id: string) => {
  const index = uploadQueue.value.findIndex(item => item.id === id)
  if (index > -1) {
    const item = uploadQueue.value[index]
    if (item && item.status === 'uploading') {
      item.abortController?.abort()
      isUploading.value = false
    }
    // 释放预览图 URL
    if (item && item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
    uploadQueue.value.splice(index, 1)
    emit('queueChange', uploadQueue.value.length)
  }
}

// 清空队列
const clearQueue = () => {
  // 取消所有上传中的任务
  uploadQueue.value.forEach(item => {
    if (item.status === 'uploading') {
      item.abortController?.abort()
    }
    // 释放预览图 URL
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
  })

  uploadQueue.value = []
  isUploading.value = false
  emit('queueChange', 0)
}

// 获取状态文本
const getStatusText = (item: UploadQueueItem): string => {
  switch (item.status) {
    case 'waiting':
      return t('fileUpload.statusWaiting')
    case 'uploading':
      return item.currentChunk !== undefined
        ? `${t('fileUpload.statusUploading')} (${item.currentChunk + 1}/${item.chunks?.length || 0})`
        : t('fileUpload.calculating')
    case 'paused':
      return t('fileUpload.statusPaused')
    case 'completed':
      return t('fileUpload.statusCompleted')
    case 'error':
      return item.error || t('fileUpload.statusError')
    default:
      return t('fileUpload.statusError')
  }
}

// 格式化剩余时间
const formatRemainingTime = (seconds: number): string => {
  if (!seconds || seconds < 0) return '计算中...'

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const pad = (num: number) => num.toString().padStart(2, '0')

  if (h > 0) {
    return `${pad(h)}时:${pad(m)}分:${pad(s)}秒`
  } else if (m > 0) {
    return `${pad(m)}分:${pad(s)}秒`
  } else {
    return `${pad(s)}秒`
  }
}
</script>

<style lang="scss" scoped>
.file-upload {
  position: relative;
  display: inline-block;

  .upload-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 15px;
    font-size: 14px;
    border-radius: 4px;
    border: 1px solid transparent;
    background-color: #409eff;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.3s;
    font-weight: 500;
    white-space: nowrap;
    user-select: none;
    outline: none;

    &:hover:not(:disabled) {
      background-color: #66b1ff;
      border-color: #66b1ff;
    }

    &:active:not(:disabled) {
      background-color: #3a8ee6;
      border-color: #3a8ee6;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &.is-loading {
      pointer-events: none;
    }

    .el-icon {
      font-size: 16px;

      &.is-loading {
        animation: rotating 2s linear infinite;
      }
    }
  }

  @keyframes rotating {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  .drop-zone {
    margin-top: 20px;
    padding: 40px;
    border: 2px dashed #dcdfe6;
    border-radius: 8px;
    text-align: center;
    background-color: #fafafa;
    transition: all 0.3s;
    cursor: pointer;

    &:hover,
    &.drag-over {
      border-color: #409eff;
      background-color: #f0f9ff;
    }

    .drop-icon {
      color: #c0c4cc;
      margin-bottom: 16px;
    }

    .drop-text {
      font-size: 16px;
      color: #606266;
      margin: 0 0 8px 0;
    }

    .drop-hint {
      font-size: 14px;
      color: #909399;
      margin: 0;
    }
  }

  .upload-queue {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 2000;
    width: 400px;
    max-height: 500px;
    overflow-y: auto;
    background-color: white;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    margin-top: 12px;
    padding: 16px;

    .queue-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #ebeef5;

      h4 {
        margin: 0;
        color: #303133;
        font-size: 16px;
      }
    }

    .queue-list {
      .queue-item {
        display: flex;
        align-items: center;
        padding: 12px;
        border: 1px solid #ebeef5;
        border-radius: 6px;
        margin-bottom: 12px;
        background-color: white;
        transition: all 0.3s;

        &:last-child {
          margin-bottom: 0;
        }

        &.uploading {
          border-color: #409eff;
          background-color: #f0f9ff;
        }

        .file-info {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;

          .file-icon-wrapper {
            margin-right: 12px;
            flex-shrink: 0;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;

            .file-preview-img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              border-radius: 4px;
            }

            .file-icon {
              font-size: 24px;
              color: #909399;
            }
          }

          .file-details {
            min-width: 0;
            flex: 1;

            .file-name {
              font-size: 14px;
              color: #303133;
              margin-bottom: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .file-size {
              font-size: 12px;
              color: #909399;
            }
          }
        }

        .upload-progress {
          flex: 1.5;
          margin: 0 16px;

          .progress-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;

            .status-text {
              font-size: 12px;
              color: #606266;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-right: 8px;
            }

            .progress-percent {
              font-size: 12px;
              color: #409eff;
              font-weight: 600;
              flex-shrink: 0;
              text-align: right;
            }
          }
        }

        .upload-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }
      }
    }
  }
}

.remaining-time {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  text-align: right;
}
</style>