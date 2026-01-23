<template>
  <div class="file-upload">
    <!-- 上传按钮 -->
    <el-button 
      type="primary" 
      :icon="Upload" 
      @click="triggerFileSelect"
      :loading="isUploading"
    >
      {{ isUploading ? '上传中...' : '上传文件' }}
    </el-button>

    <!-- 隐藏的文件输入框 -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      @change="handleFileSelect"
      :accept="acceptedTypes"
    />

    <!-- 拖拽上传区域 -->
    <div
      v-if="showDropZone"
      class="drop-zone"
      :class="{ 'drag-over': isDragOver }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
    >
      <el-icon class="drop-icon" size="48">
        <Upload />
      </el-icon>
      <p class="drop-text">拖拽文件到此处上传</p>
      <p class="drop-hint">或点击上方按钮选择文件</p>
    </div>

    <!-- 上传队列 -->
    <div v-if="uploadQueue.length > 0" class="upload-queue">
      <div class="queue-header">
        <h4>上传队列 ({{ uploadQueue.length }})</h4>
        <el-button 
          size="small" 
          type="danger" 
          @click="clearQueue"
          :disabled="isUploading"
        >
          清空队列
        </el-button>
      </div>

      <div class="queue-list">
        <div
          v-for="item in uploadQueue"
          :key="item.id"
          class="queue-item"
          :class="{ 'uploading': item.status === 'uploading' }"
        >
          <div class="file-info">
            <el-icon class="file-icon">
              <Document />
            </el-icon>
            <div class="file-details">
              <div class="file-name">{{ item.file.name }}</div>
              <div class="file-size">{{ formatFileSize(item.file.size) }}</div>
            </div>
          </div>

          <div class="upload-progress">
            <div class="progress-info">
              <span class="status-text">{{ getStatusText(item) }}</span>
              <span v-if="item.status === 'uploading'" class="progress-percent">
                {{ item.progress }}%
              </span>
            </div>
            
            <el-progress
              v-if="item.status === 'uploading' || item.status === 'completed' || item.status === 'error'"
              :percentage="item.progress"
              :status="item.status === 'completed' ? 'success' : 
                       item.status === 'error' ? 'exception' : undefined"
              :stroke-width="4"
            />
          </div>

          <div class="upload-actions">
            <el-button
              v-if="item.status === 'waiting' || item.status === 'paused'"
              size="small"
              type="primary"
              @click="startUpload(item)"
            >
              开始
            </el-button>
            
            <el-button
              v-if="item.status === 'uploading'"
              size="small"
              @click="pauseUpload(item)"
            >
              暂停
            </el-button>
            
            <el-button
              v-if="item.status === 'paused'"
              size="small"
              type="primary"
              @click="resumeUpload(item)"
            >
              继续
            </el-button>
            
            <el-button
              size="small"
              type="danger"
              @click="removeFromQueue(item.id)"
              :disabled="item.status === 'uploading'"
            >
              移除
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
import { Upload, Document } from '@element-plus/icons-vue'
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

// Props
interface Props {
  parentId?: number
  showDropZone?: boolean
  maxFiles?: number
}

const props = withDefaults(defineProps<Props>(), {
  showDropZone: true,
  maxFiles: 10
})

// Emits
const emit = defineEmits<{
  uploadSuccess: [file: any]
  uploadError: [error: string]
  queueChange: [count: number]
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
  for (const file of validFiles) {
    const queueItem: UploadQueueItem = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      file,
      status: 'waiting',
      progress: 0
    }
    
    uploadQueue.value.push(queueItem)
  }

  emit('queueChange', uploadQueue.value.length)
  
  if (validFiles.length > 0) {
    ElMessage.success(`已添加 ${validFiles.length} 个文件到上传队列`)
    
    // 自动开始上传第一个文件
    if (!isUploading.value) {
      startNextUpload()
    }
  }
}

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
        item.file.type,
        props.parentId
      )
      
      item.status = 'completed'
      item.progress = 100
      ElMessage.success(`${item.file.name} 秒传成功`)
      emit('uploadSuccess', fileInfo)
    } else {
      // 对于空文件或很小的文件，直接使用传统上传
      if (item.file.size === 0) {
        // 空文件特殊处理：直接创建文件记录
        const fileInfo = await fileApiService.mergeChunks(
          item.fileHash,
          item.file.name,
          item.file.size,
          item.file.type,
          0, // 空文件的分片数为0
          props.parentId
        )
        
        item.status = 'completed'
        item.progress = 100
        ElMessage.success(`${item.file.name} 上传成功`)
        emit('uploadSuccess', fileInfo)
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
    isUploading.value = false
    
    // 继续上传队列中的下一个文件
    setTimeout(() => {
      startNextUpload()
    }, 1000)
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
          item.progress = Math.round(totalProgress)
        }
      )

      uploadedCount++
      item.uploadedChunks.push(i)
      item.progress = Math.round((uploadedCount / totalChunks) * 100)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return // 用户取消上传
      }
      throw error
    }
  }

  // 合并分片
  const fileInfo = await fileApiService.mergeChunks(
    item.fileHash,
    item.file.name,
    item.file.size,
    item.file.type,
    totalChunks,
    props.parentId
  )

  item.status = 'completed'
  item.progress = 100
  ElMessage.success(`${item.file.name} 上传成功`)
  emit('uploadSuccess', fileInfo)
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
  })
  
  uploadQueue.value = []
  isUploading.value = false
  emit('queueChange', 0)
}

// 获取状态文本
const getStatusText = (item: UploadQueueItem): string => {
  switch (item.status) {
    case 'waiting':
      return '等待上传'
    case 'uploading':
      return item.currentChunk !== undefined 
        ? `上传中 (${item.currentChunk + 1}/${item.chunks?.length || 0})`
        : '准备中...'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '上传完成'
    case 'error':
      return item.error || '上传失败'
    default:
      return '未知状态'
  }
}
</script>

<style lang="scss" scoped>
.file-upload {
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
    margin-top: 20px;

    .queue-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h4 {
        margin: 0;
        color: #303133;
      }
    }

    .queue-list {
      .queue-item {
        display: flex;
        align-items: center;
        padding: 16px;
        border: 1px solid #ebeef5;
        border-radius: 8px;
        margin-bottom: 12px;
        background-color: white;
        transition: all 0.3s;

        &.uploading {
          border-color: #409eff;
          background-color: #f0f9ff;
        }

        .file-info {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;

          .file-icon {
            font-size: 24px;
            color: #909399;
            margin-right: 12px;
            flex-shrink: 0;
          }

          .file-details {
            min-width: 0;

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
          flex: 2;
          margin: 0 20px;

          .progress-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;

            .status-text {
              font-size: 12px;
              color: #606266;
            }

            .progress-percent {
              font-size: 12px;
              color: #409eff;
              font-weight: 600;
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
</style>