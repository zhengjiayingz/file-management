<template>
  <div class="index-container">
    <!-- 左侧导航栏 -->
    <Sidebar />

    <!-- 主要内容区域 -->
    <el-container class="main-container">
      <!-- 顶部工具栏 -->
      <GlobalHeader>
        <template #left>
          <FileUpload ref="fileUploadRef" :parent-id="currentFolderId" :show-drop-zone="false"
            @upload-success="handleUploadSuccess" @upload-error="handleUploadError" :interceptImage="true"
            @select-image="handleSelectImage" />
          <el-button :icon="FolderAdd" @click="showCreateFolderDialog">{{ t('index.createFolder') }}</el-button>
        </template>
        <template #right>
          <el-input v-model="searchText" :placeholder="t('index.searchPlaceholder')" :prefix-icon="Search"
            style="width: 300px; margin-right: 20px;" @input="handleSearch" />
        </template>
      </GlobalHeader>

      <!-- 文件操作工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item @click="navigateToFolder()" style="cursor: pointer;">{{ t('index.toolbar.all')
            }}</el-breadcrumb-item>
            <el-breadcrumb-item v-for="folder in breadcrumbs" :key="folder.id" @click="navigateToFolder(folder.id)"
              style="cursor: pointer;">
              {{ folder.name }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="toolbar-right">
          <el-button-group>
            <el-button :icon="List" @click="viewMode = 'list'" :type="viewMode === 'list' ? 'primary' : ''">
              {{ t('index.toolbar.list') }}
            </el-button>
            <el-button :icon="Grid" @click="viewMode = 'grid'" :type="viewMode === 'grid' ? 'primary' : ''">
              {{ t('index.toolbar.grid') }}
            </el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 文件列表区域 -->
      <el-main class="file-content">
        <!-- 拖拽上传区域 -->
        <div class="drop-zone-overlay" :class="{ 'show': isDragOver }" @drop="handleDrop" @dragover="handleDragOver"
          @dragenter="handleDragEnter" @dragleave="handleDragLeave">
          <div class="drop-zone-content">
            <el-icon class="drop-icon" size="64">
              <Upload />
            </el-icon>
            <p class="drop-text">拖拽文件到此处上传</p>
          </div>
        </div>

        <!-- 文件列表 -->
        <FileList :files="filteredFiles" :view-mode="viewMode" :loading="loading" @click-file="handleFileClick"
          @dblclick-file="handleFileDoubleClick" @context-menu="handleRightClick" @rename="showRenameDialog"
          @delete="deleteFile" @move="handleMoveFile" @file-drop="handleFileItemDrop" />

        <!-- 存储空间信息 -->
        <div class="storage-info" v-if="authStore.user">
          <div class="storage-icon">
            <el-icon size="24" color="#409eff">
              <Upload />
            </el-icon>
          </div>
          <div class="storage-text">
            {{ formatStorage(authStore.user.storageUsed) }} /
            {{ authStore.user.storageQuota === -1 ? '无限制' : formatStorage(authStore.user.storageQuota) }}
          </div>
        </div>
      </el-main>
    </el-container>

    <!-- 创建文件夹对话框 -->
    <el-dialog v-model="createFolderDialogVisible" title="新建文件夹" width="400px">
      <el-form @submit.prevent="createFolder">
        <el-form-item label="文件夹名称">
          <el-input v-model="newFolderName" placeholder="请输入文件夹名称" maxlength="255" show-word-limit
            @keyup.enter="createFolder" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createFolderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createFolder" :loading="isCreatingFolder">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 图片裁剪弹窗 -->
    <image-cropper-dialog v-model="showCropper" :img-file="croppingFile as any" @upload="handleCroppedUpload" />

    <!-- 重命名对话框 -->
    <el-dialog v-model="renameDialogVisible" title="重命名" width="400px">
      <el-form @submit.prevent="confirmRename">
        <el-form-item label="新名称">
          <el-input v-model="newFileName" placeholder="请输入新名称" maxlength="255" show-word-limit
            @keyup.enter="confirmRename" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRename" :loading="isRenaming">
          确定
        </el-button>
      </template>
    </el-dialog>
    <!-- 图片大图预览 -->
    <el-image-viewer v-if="previewVisible" @close="previewVisible = false" :url-list="previewUrlList"
      :initial-index="0" />

    <!-- 视频播放弹窗 -->
    <video-player-dialog v-model="videoPlayerVisible" :title="currentVideoTitle" :video-url="currentVideoUrl"
      :file-name="currentVideoTitle" @download="currentVideoFile && downloadFile(currentVideoFile)" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import {
  User, ArrowDown, Folder, Search, FolderAdd,
  Clock, Star, Delete, List, Grid, MoreFilled, Document
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'
import fileApiService from '../../api/file'
import type { FileItem as FileInfo } from '../../types/file'
import FileUpload from '../../components/FileUpload.vue'
import ImageCropperDialog from '../../components/ImageCropperDialog.vue'
import VideoPlayerDialog from '../../components/VideoPlayerDialog.vue'
import Sidebar from './cpns/Sidebar.vue'
import FileList from './cpns/FileList.vue'
import GlobalHeader from '../../components/GlobalHeader.vue'
import { formatFileSize } from '../../utils/fileUpload'

const router = useRouter()
const authStore = useAuthStore()
const { t, locale } = useI18n()

// 响应式数据
const searchText = ref('')
const viewMode = ref<'list' | 'grid'>('list')
const files = ref<FileInfo[]>([])
const currentFolderId = ref<number | undefined>(undefined)
const breadcrumbs = ref<{ id: number; name: string }[]>([])
const isDragOver = ref(false)
const loading = ref(false)

// 对话框相关
const createFolderDialogVisible = ref(false)
const newFolderName = ref('')
const isCreatingFolder = ref(false)

const renameDialogVisible = ref(false)
const newFileName = ref('')
const currentRenameFile = ref<FileInfo | null>(null)
const isRenaming = ref(false)

const showCropper = ref(false)
const croppingFile = ref<File | null>(null)
const fileUploadRef = ref()

// 视频播放相关
const videoPlayerVisible = ref(false)
const currentVideoUrl = ref('')
const currentVideoTitle = ref('')
const currentVideoFile = ref<FileInfo | null>(null)

const handleSelectImage = (file: File) => {
  croppingFile.value = file
  showCropper.value = true
}

// 计算属性
const filteredFiles = computed(() => {
  let result = files.value

  // 搜索过滤
  if (searchText.value) {
    const keyword = searchText.value.toLowerCase()
    result = result.filter((file: FileInfo) =>
      file.fileName.toLowerCase().includes(keyword)
    )
  }

  // 排序：文件夹优先，然后按时间倒序
  return result.sort((a: FileInfo, b: FileInfo) => {
    // 1. 文件夹优先
    if (a.fileType === 'folder' && b.fileType !== 'folder') return -1
    if (a.fileType !== 'folder' && b.fileType === 'folder') return 1

    // 2. 按创建时间倒序
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })


})


// 生命周期
onMounted(() => {
  loadFiles()
})

// 加载文件列表
const loadFiles = async () => {
  try {
    loading.value = true
    files.value = await fileApiService.getFiles({ parentId: currentFolderId.value })
  } catch (error: any) {
    ElMessage.error('加载文件列表失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 文件上传成功处理
const handleUploadSuccess = (fileInfo: FileInfo) => {
  files.value.unshift(fileInfo)
  ElMessage.success('文件上传成功')
  // 刷新用户信息以更新存储配额显示
  authStore.refreshUserInfo()
}

// 文件上传错误处理
const handleUploadError = (error: string) => {
  ElMessage.error('文件上传失败: ' + error)
}

// 搜索处理
const handleSearch = () => {
  // 搜索逻辑已在计算属性中处理
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
  // 只有当离开整个区域时才隐藏
  if (!event.relatedTarget || !(event.target as Element).contains(event.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false

  if (event.dataTransfer?.files) {
    // 这里可以触发文件上传组件的拖拽上传
    console.log('拖拽文件:', Array.from(event.dataTransfer.files))
  }
}

// 文件点击处理
const handleFileClick = (file: FileInfo) => {
  // 单击选中文件
  console.log('选中文件:', file)
}

// 图片预览相关
const previewVisible = ref(false)
const previewUrlList = ref<string[]>([])

// 获取文件下载链接（用于预览原图或播放视频）
const getFileViewUrl = (file: FileInfo) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  return `${API_BASE_URL}/api/files/${file.id}/download?token=${token}&preview=true`
}

// 辅助函数
const isImageFile = (file: FileInfo) => {
  return (file.mimeType && file.mimeType.startsWith('image/')) ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.fileName)
}

const isVideoFile = (file: FileInfo) => {
  return (file.mimeType && file.mimeType.startsWith('video/')) ||
    /\.(mp4|webm|ogg|mov|wmv|flv|avi|rmvb|mkv)$/i.test(file.fileName)
}

// 获取文件下载链接
const getFileDownloadUrl = (file: FileInfo) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  return `${API_BASE_URL}/api/files/${file.id}/download?token=${token}`
}

// 文件双击处理
const handleFileDoubleClick = (file: FileInfo) => {
  console.log('Double clicked file:', file)
  if (file.fileType === 'folder') {
    navigateToFolder(file.id, file.fileName)
  } else {
    // 如果是图片，则打开大图预览
    if (isImageFile(file)) {
      previewUrlList.value = [getFileViewUrl(file)]
      previewVisible.value = true
    } else if (isVideoFile(file)) {
      // 如果是视频，则打开视频播放器
      currentVideoUrl.value = getFileViewUrl(file)
      currentVideoTitle.value = file.fileName
      currentVideoFile.value = file
      videoPlayerVisible.value = true
    } else {
      // 其他文件下载
      downloadFile(file)
    }
  }
}

const handleRightClick = (event: MouseEvent, file: FileInfo) => {
  // 暂时不处理右键菜单，或者将来显示自定义菜单
}

// 导航到文件夹
const navigateToFolder = (folderId?: number, folderName?: string) => {
  currentFolderId.value = folderId

  // 更新面包屑导航
  if (folderId === undefined) {
    // 返回根目录
    breadcrumbs.value = []
  } else {
    // 检查是否点击了已存在的面包屑
    const existingIndex = breadcrumbs.value.findIndex(b => b.id === folderId)
    if (existingIndex !== -1) {
      // 点击了已存在的面包屑，截断到该位置
      breadcrumbs.value = breadcrumbs.value.slice(0, existingIndex + 1)
    } else if (folderName) {
      // 进入新文件夹，添加到面包屑
      breadcrumbs.value.push({ id: folderId, name: folderName })
    }
  }

  loadFiles()
}

// 获取文件图标颜色
const getFileIconColor = (file: FileInfo): string => {
  if (file.fileType === 'folder') {
    return '#ffd04b'
  }

  // 根据文件类型返回不同颜色
  if (file.mimeType && file.mimeType.startsWith('image/')) {
    return '#67c23a'
  } else if (file.mimeType && file.mimeType.startsWith('video/')) {
    return '#e6a23c'
  } else if (file.mimeType && file.mimeType.includes('pdf')) {
    return '#f56c6c'
  } else {
    return '#909399'
  }
}

// 格式化日期
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return '今天'
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString()
  }
}

// 文件操作处理
const handleFileAction = async (command: string, file: FileInfo) => {
  switch (command) {
    case 'download':
      await downloadFile(file)
      break
    case 'rename':
      showRenameDialog(file)
      break
    case 'move':
      ElMessage.info('移动功能开发中...')
      break
    case 'delete':
      await deleteFile(file)
      break
  }
}

// 获取文件预览 URL
const getFilePreviewUrl = (file: FileInfo) => {
  // 保持与 api/file.ts 一致的 Base URL 逻辑
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  // 构造完整 URL: http://localhost:3000/api/files/:id/thumbnail?token=...
  return `${API_BASE_URL}/api/files/${file.id}/thumbnail?token=${token}`
}

// 处理裁剪后的上传
const handleCroppedUpload = async (file: File) => {
  try {
    if (fileUploadRef.value) {
      fileUploadRef.value.addFile(file)
    } else {
      ElMessage.error('上传组件未就绪')
    }
  } catch (err: any) {
    console.error(err)
    ElMessage.error('上传处理失败')
  }
}
const handleImageError = (e: Event) => {
  const target = e.target as HTMLImageElement
  target.style.display = 'none'

  const parent = target.closest('.image-thumbnail') as HTMLElement
  if (parent) {
    parent.style.display = 'none'
  }
}

// 下载文件
const downloadFile = async (file: FileInfo) => {
  try {
    const blob = await fileApiService.downloadFile(file.id)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success('文件下载成功')
  } catch (error: any) {
    ElMessage.error('文件下载失败: ' + (error.message || '未知错误'))
  }
}

// 显示创建文件夹对话框
const showCreateFolderDialog = () => {
  newFolderName.value = ''
  createFolderDialogVisible.value = true
}

// 创建文件夹
const createFolder = async () => {
  if (!newFolderName.value.trim()) {
    ElMessage.warning('请输入文件夹名称')
    return
  }

  try {
    isCreatingFolder.value = true
    const folder = await fileApiService.createFolder(newFolderName.value.trim(), currentFolderId.value)
    files.value.unshift(folder)
    createFolderDialogVisible.value = false
    ElMessage.success('文件夹创建成功')
  } catch (error: any) {
    ElMessage.error('文件夹创建失败: ' + (error.message || '未知错误'))
  } finally {
    isCreatingFolder.value = false
  }
}

// 显示重命名对话框
const showRenameDialog = (file: FileInfo) => {
  currentRenameFile.value = file
  newFileName.value = file.fileName
  renameDialogVisible.value = true
}

// 确认重命名
const confirmRename = async () => {
  if (!currentRenameFile.value || !newFileName.value.trim()) {
    ElMessage.warning('请输入新名称')
    return
  }

  try {
    isRenaming.value = true
    if (!currentRenameFile.value) return

    await fileApiService.renameFile(currentRenameFile.value.id, newFileName.value.trim())

    // 更新本地数据
    const index = files.value.findIndex((f: FileInfo) => f.id === currentRenameFile.value?.id)
    if (index > -1 && currentRenameFile.value && files.value[index]) {
      files.value[index].fileName = newFileName.value.trim()
    }

    renameDialogVisible.value = false
    ElMessage.success('重命名成功')
  } catch (error: any) {
    ElMessage.error('重命名失败: ' + (error?.message || '未知错误'))
  } finally {
    isRenaming.value = false
  }
}

// 删除文件
const deleteFile = async (file: FileInfo) => {
  try {
    await ElMessageBox.confirm(
      `确定要将 "${file.fileName}" 移入回收站吗？`,
      '删除文件',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await fileApiService.deleteFile(file.id)

    // 从列表中移除
    const index = files.value.findIndex((f: FileInfo) => f.id === file.id)
    if (index > -1) {
      files.value.splice(index, 1)
    }

    ElMessage.success('文件删除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('文件删除失败: ' + (error?.message || '未知错误'))
    }
  }
}

const handleMoveFile = (file: FileInfo) => {
  ElMessage.info('移动功能开发中...')
}

const handleFileItemDrop = async (source: FileInfo, target: FileInfo) => {
  ElMessage.info(`Request to move ${source.fileName} to ${target.fileName} (Dev)`)
}

// 格式化存储大小
const formatStorage = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 处理下拉菜单命令

</script>

<style lang="scss" scoped>
.index-container {
  display: flex;
  height: 100vh;
  background-color: #f5f7fa;
}



.logo {
  color: #303133;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

// 主容器
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

// 顶部工具栏
.header {
  background: white;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;

  &-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;
  }

  &-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &-right {
    display: flex;
    align-items: center;
  }
}

.user-dropdown {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
  padding: 8px 12px;
  border-radius: 4px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #f5f7fa;
  }

  .el-icon {
    margin: 0 4px;
  }
}

// 工具栏
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #e4e7ed;

  &-left {
    .el-breadcrumb {
      font-size: 14px;

      :deep(.el-breadcrumb__item) {
        cursor: pointer;

        &:hover {
          color: #409eff;
        }
      }
    }
  }
}

// 文件内容区域
.file-content {
  background: white;
  padding: 20px;
  overflow-y: auto;
  position: relative;
}

// 拖拽上传覆盖层
.drop-zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(64, 158, 255, 0.1);
  border: 2px dashed #409eff;
  border-radius: 8px;
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  &.show {
    display: flex;
  }

  .drop-zone-content {
    text-align: center;

    .drop-icon {
      color: #409eff;
      margin-bottom: 16px;
    }

    .drop-text {
      font-size: 18px;
      color: #409eff;
      margin: 0;
      font-weight: 600;
    }
  }
}



// 存储空间信息
.storage-info {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  font-size: 14px;
  color: #606266;
}

.storage-icon {
  margin-right: 8px;
}

// 响应式设计
@media (max-width: 768px) {
  .sidebar {
    width: 60px !important;

    &-header .logo {
      display: none;
    }
  }

  .header {
    &-left {
      gap: 8px;
    }

    &-right .el-input {
      width: 200px !important;
    }
  }

  .file-list.grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }
}
</style>