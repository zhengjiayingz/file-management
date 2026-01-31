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

      <!-- 批量操作工具栏 (当有选中文件时显示) -->
      <div class="batch-toolbar" v-if="selectedFiles.size > 0">
        <div class="batch-info">
          已选中 {{ selectedFiles.size }} 项
          <el-button link type="primary" @click="clearSelection">取消选择</el-button>
        </div>
        <div class="batch-actions">
          <el-button type="primary" :icon="Document" @click="batchDownload">{{ t('fileList.action.download') || '下载'
          }}</el-button>
          <el-button type="success" :icon="Folder" @click="batchMove">{{ t('fileList.action.move') }}</el-button>
          <el-button type="danger" :icon="Delete" @click="batchDelete">{{ t('fileList.action.delete') }}</el-button>
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
        <!-- 文件列表 -->
        <FileList :files="filteredFiles" :view-mode="viewMode" :loading="loading" :selected-files="selectedFiles"
          :sort-by="sortBy" :sort-order="sortOrder" @click-file="handleFileClick" @dblclick-file="handleFileDoubleClick"
          @context-menu="handleRightClick" @rename="showRenameDialog" @delete="deleteFile" @move="handleMoveFile"
          @download="downloadFile" @file-drop="handleFileItemDrop" @sort-change="handleSortChange"
          @toggle-selection="toggleSelection" @select-all="selectAll" />

        <!-- 存储空间信息 -->
        <!-- 存储空间信息 -->
        <div class="storage-info" v-if="authStore.user">
          <div class="storage-content">
            <div class="storage-text-row">
              <el-icon class="storage-icon" size="20" color="#409eff">
                <Upload />
              </el-icon>
              <span class="storage-text">
                {{ formatStorage(authStore.user.storageUsed) }} /
                {{ authStore.user.storageQuota === -1 ? '无限制' : formatStorage(authStore.user.storageQuota) }}
              </span>
            </div>
            <el-progress v-if="authStore.user.storageQuota !== -1" :percentage="storagePercentage" :show-text="false"
              :stroke-width="6"
              :status="storagePercentage > 90 ? 'exception' : (storagePercentage > 75 ? 'warning' : 'success')"
              class="storage-progress" />
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
    <CustomImageViewer v-model="previewVisible" :url-list="previewUrlList" :initial-index="previewInitialIndex" />

    <!-- 视频播放弹窗 -->
    <video-player-dialog v-model="videoPlayerVisible" :title="currentVideoTitle" :video-url="currentVideoUrl"
      :file-name="currentVideoTitle" @download="currentVideoFile && downloadFile(currentVideoFile)" />

    <!-- 移动文件弹窗 -->
    <MoveDialog v-model="moveDialogVisible" :files-to-move="filesToMove" @success="handleMoveSuccess" />

    <!-- 历史版本弹窗 -->
    <FileHistoryDialog v-model="showHistoryDialog" :file-id="historyFile?.id"
      @rollback-success="handleHistorySuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import {
  User, ArrowDown, Folder, Search, FolderAdd,
  Clock, Star, Delete, List, Grid, MoreFilled, Document, Download
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'
import fileApiService from '../../api/file'
import type { FileItem as FileInfo } from '../../types/file'
import FileUpload from '../../components/FileUpload.vue'
import ImageCropperDialog from '../../components/ImageCropperDialog.vue'
import VideoPlayerDialog from '../../components/VideoPlayerDialog.vue'
import MoveDialog from '../../components/MoveDialog.vue'
import FileHistoryDialog from '../../components/FileHistoryDialog.vue'
import CustomImageViewer from '../../components/CustomImageViewer.vue'
import Sidebar from './cpns/Sidebar.vue'
import FileList from './cpns/FileList.vue'
import GlobalHeader from '../../components/GlobalHeader.vue'
import { formatFileSize } from '../../utils/fileUpload'

const router = useRouter()
const route = useRoute()
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

const showHistoryDialog = ref(false)
const historyFile = ref<FileInfo | null>(null)

// 视频播放相关
const videoPlayerVisible = ref(false)
const currentVideoUrl = ref('')
const currentVideoTitle = ref('')
const currentVideoFile = ref<FileInfo | null>(null)

// 移动文件相关
const moveDialogVisible = ref(false)
const filesToMove = ref<FileInfo[]>([])

const handleSelectImage = (file: File) => {
  croppingFile.value = file
  showCropper.value = true
}

// 计算属性
const sortBy = ref<'name' | 'size' | 'time'>('time')
const sortOrder = ref<'asc' | 'desc'>('desc')
const selectedFiles = ref<Set<number>>(new Set())

// 计算属性
const filteredFiles = computed(() => {
  let result = [...files.value] // Create a shallow copy

  // 搜索过滤
  if (searchText.value) {
    const keyword = searchText.value.toLowerCase()
    result = result.filter((file: FileInfo) =>
      file.fileName.toLowerCase().includes(keyword)
    )
  }

  // 排序
  return result.sort((a: FileInfo, b: FileInfo) => {
    // 始终将文件夹排在前面 (可选，根据需求)
    // 如果想要纯排序，可以去掉这部分，但通常文件管理器文件夹在最前
    if (a.fileType === 'folder' && b.fileType !== 'folder') return -1
    if (a.fileType !== 'folder' && b.fileType === 'folder') return 1

    // 如果都是文件夹或都是文件，则按规则排序
    let compareResult = 0
    switch (sortBy.value) {
      case 'name':
        compareResult = a.fileName.localeCompare(b.fileName, 'zh-CN')
        break
      case 'size':
        compareResult = (a.fileSize || 0) - (b.fileSize || 0)
        break
      case 'time':
      default:
        compareResult = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
    }

    return sortOrder.value === 'asc' ? compareResult : -compareResult
  })
})

const handleSortChange = (column: 'name' | 'size' | 'time') => {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortOrder.value = 'desc' // 默认降序
  }
}

// 多选相关逻辑
const toggleSelection = (file: FileInfo, multiSelect = false) => {
  if (multiSelect) {
    if (selectedFiles.value.has(file.id)) {
      selectedFiles.value.delete(file.id)
    } else {
      selectedFiles.value.add(file.id)
    }
  } else {
    // 单选模式 (或者点击非选框区域)
    selectedFiles.value.clear()
    selectedFiles.value.add(file.id)
  }
}

const clearSelection = () => {
  selectedFiles.value.clear()
}

const selectAll = (checked: boolean) => {
  if (checked) {
    files.value.forEach(f => selectedFiles.value.add(f.id))
  } else {
    selectedFiles.value.clear()
  }
}

const storagePercentage = computed(() => {
  if (!authStore.user || authStore.user.storageQuota <= 0) return 0
  let pct = (authStore.user.storageUsed / authStore.user.storageQuota) * 100
  return Math.min(Math.max(pct, 0), 100) // Clamp between 0 and 100

})


// 生命周期
onMounted(() => {
  loadFiles()
})

// 加载文件列表
const loadFiles = async () => {
  try {
    loading.value = true
    const params: any = {}

    // Check for type filter (category view)
    const type = route.query.type
    if (type) {
      params.type = type
      // In category view, we ignore parentId (handled by backend or we don't send it)
    } else {
      params.parentId = currentFolderId.value
    }

    if (searchText.value.trim()) {
      params.q = searchText.value.trim()
      delete params.parentId
      delete params.type
    }
    files.value = await fileApiService.getFiles(params)
  } catch (error: any) {
    ElMessage.error('加载文件列表失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// Watch for route query changes (e.g. switching categories)
watch(() => route.query, () => {
  // Clear search text when switching categories or views
  searchText.value = ''
  currentFolderId.value = undefined // Reset folder when switching top-level views via URL
  breadcrumbs.value = []
  loadFiles()
})

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

let searchTimeout: any = null
// 搜索处理
const handleSearch = () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    loadFiles()
  }, 300)
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
const previewInitialIndex = ref(0)

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

const isDocumentFile = (file: FileInfo) => {
  const mime = file.mimeType || ''
  const name = file.fileName.toLowerCase()
  // 支持浏览器直接预览的类型：PDF, 文本, 图片(有些图片非image/开头), 代码文件
  return mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    /\.(pdf|txt|md|json|xml|html|js|css|ts)$/i.test(name)
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
      // 获取当前列表中的所有图片
      const imageFiles = filteredFiles.value.filter(f => isImageFile(f))
      // 生成 URL 列表
      previewUrlList.value = imageFiles.map(f => getFileViewUrl(f))
      // 找到当前点击图片的索引
      previewInitialIndex.value = imageFiles.findIndex(f => f.id === file.id)
      if (previewInitialIndex.value === -1) previewInitialIndex.value = 0

      previewVisible.value = true
    } else if (isVideoFile(file)) {
      // 如果是视频，则打开视频播放器
      currentVideoUrl.value = getFileViewUrl(file)
      currentVideoTitle.value = file.fileName
      currentVideoFile.value = file
      videoPlayerVisible.value = true
    } else if (isOfficeFile(file)) {
      // 检查是否为本地环境
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || (hostname.startsWith('172.') && parseInt(hostname.split('.')[1] || '0') >= 16 && parseInt(hostname.split('.')[1] || '0') <= 31);

      if (isLocal) {
        ElMessage.warning('本地环境无法预览 Office 文件，请部署到公网或使用内网穿透');
        return;
      }

      // Office 文件预览 (需要公网访问权限)
      const url = getFileViewUrl(file)
      const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
      window.open(officeUrl, '_blank')
    } else if (isDocumentFile(file)) {
      // 如果是文档，尝试新窗口预览 (PDF, text, etc)
      const url = getFileViewUrl(file)
      window.open(url, '_blank')
    } else {
      // 其他文件不进行默认操作，如需下载请点击下载按钮
      // downloadFile(file)
    }
  }
}

const isOfficeFile = (file: FileInfo) => {
  const name = file.fileName.toLowerCase()
  return /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(name)
}

const handleRightClick = (event: MouseEvent, file: FileInfo) => {
  // 暂时不处理右键菜单，或者将来显示自定义菜单
}

// 导航到文件夹
const navigateToFolder = (folderId?: number, folderName?: string) => {
  // If we are in category view, we must exit it first
  if (route.query.type) {
    router.push({ path: '/', query: {} })
  }

  currentFolderId.value = folderId
  searchText.value = ''

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

// 批量下载
const batchDownload = async () => {
  if (selectedFiles.value.size === 0) return
  const ids = Array.from(selectedFiles.value)

  // 浏览器通常会阻止同时弹出多个下载。
  // MVP 方案：循环下载。
  for (const id of ids) {
    const file = files.value.find(f => f.id === id)
    if (file && file.fileType !== 'folder') {
      downloadFile(file)
    }
  }
}

// 批量移动
const batchMove = () => {
  if (selectedFiles.value.size === 0) return
  const selected = files.value.filter(f => selectedFiles.value.has(f.id))
  filesToMove.value = selected
  moveDialogVisible.value = true
}

// 批量删除
const batchDelete = async () => {
  if (selectedFiles.value.size === 0) return

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedFiles.value.size} 个文件吗？`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const ids = Array.from(selectedFiles.value)
    // 循环调用删除 (Promise.all)
    const promises = ids.map(id => fileApiService.deleteFile(id))
    await Promise.allSettled(promises)

    ElMessage.success('批量删除完成')
    clearSelection()
    loadFiles()
  } catch (e) {
    // user cancel
  }
}

const showHistory = (file: FileInfo) => {
  historyFile.value = file
  showHistoryDialog.value = true
}

const handleHistorySuccess = () => {
  loadFiles()
  authStore.refreshUserInfo()
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
      handleMoveFile(file)
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
  filesToMove.value = [file]
  moveDialogVisible.value = true
}

const handleMoveSuccess = () => {
  loadFiles()
  // 刷新左侧空间信息等（如果需要）
  authStore.refreshUserInfo()
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

.batch-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: #ecf5ff;
  border-bottom: 1px solid #d9ecff;

  @at-root html.dark & {
    background-color: #2b2b2b;
    border-bottom-color: #4c4d4f;
  }

  .batch-info {
    font-size: 14px;
    color: #409eff;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .batch-actions {
    display: flex;
    gap: 8px;
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
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  padding: 12px 16px;
  min-width: 200px;
  z-index: 100;

  .storage-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .storage-text-row {
    display: flex;
    align-items: center;
    font-size: 14px;
    color: #606266;
  }

  .storage-icon {
    margin-right: 8px;
  }
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