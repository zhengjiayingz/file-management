<template>
  <div class="index-container">
    <Sidebar />

    <!-- 主要内容区域 -->
    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <h3>{{ t('recycleBin.title') }}</h3>
          <el-button type="danger" plain size="small" @click="handleEmptyRecycleBin" style="margin-left: 20px;">
            {{ t('recycleBin.empty') }}
          </el-button>
        </template>
        <template #right />
      </GlobalHeader>

      <!-- 文件操作工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ t('recycleBin.title') }}</el-breadcrumb-item>
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

      <FileFilterBar
        :model-value="fileFilters"
        :features="recycleFilterFeatures"
        :tag-options="tagOptions"
        @update:model-value="onFileFiltersUpdate"
        @apply="loadFiles"
      />

      <!-- 批量操作 -->
      <div class="batch-toolbar" v-if="selectedFiles.size > 0">
        <div class="batch-info">
          {{ t('recycleBin.selectedCount', { count: selectedFiles.size }) }}
          <el-button link type="primary" @click="clearSelection">{{ t('recycleBin.cancelSelection') }}</el-button>
        </div>
        <div class="batch-actions">
          <el-button type="primary" :icon="RefreshRight" @click="batchRestore">{{ t('recycleBin.batchRestore')
          }}</el-button>
          <el-button type="warning" plain @click="openBatchTagDialog">打标签</el-button>
          <el-button type="danger" :icon="Delete" @click="batchPermanentDelete">{{ t('recycleBin.batchPermanentDelete')
          }}</el-button>
        </div>
      </div>

      <!-- 文件列表区域 -->
      <el-main class="file-content" v-loading="loading">
        <!-- 文件列表 -->
        <div v-if="files.length > 0" class="file-list" :class="viewMode">
          <!-- 列表模式表头（与首页 FileList 对齐：勾选 + 图标占位 + 列标题） -->
          <div v-if="viewMode === 'list' && filteredFiles.length > 0" class="file-list-header">
            <div class="header-check">
              <el-checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate"
                @change="(v: string | number | boolean) => selectAll(!!v)" />
            </div>
            <div class="header-icon-spacer" aria-hidden="true" />
            <div class="header-item name clickable" @click="handleSortChange('name')">
              {{ t('recycleBin.header.fileName') }}
              <el-icon v-if="sortBy === 'name'" class="sort-icon">
                <component :is="sortOrder === 'asc' ? CaretTop : CaretBottom" />
              </el-icon>
            </div>
            <div class="header-item tags">{{ t('recycleBin.header.tags') }}</div>
            <div class="header-item type clickable" @click="handleSortChange('type')">
              {{ t('fileList.header.type') }}
              <el-icon v-if="sortBy === 'type'" class="sort-icon">
                <component :is="sortOrder === 'asc' ? CaretTop : CaretBottom" />
              </el-icon>
            </div>
            <div class="header-item size clickable" @click="handleSortChange('size')">
              {{ t('recycleBin.header.size') }}
              <el-icon v-if="sortBy === 'size'" class="sort-icon">
                <component :is="sortOrder === 'asc' ? CaretTop : CaretBottom" />
              </el-icon>
            </div>
            <div class="header-item date clickable" @click="handleSortChange('time')">
              {{ t('recycleBin.header.deletedAt') }}
              <el-icon v-if="sortBy === 'time'" class="sort-icon">
                <component :is="sortOrder === 'asc' ? CaretTop : CaretBottom" />
              </el-icon>
            </div>
            <div class="header-item actions">{{ t('recycleBin.header.action') }}</div>
          </div>

          <div v-for="file in filteredFiles" :key="file.id" class="file-item"
            :class="{ 'is-selected': selectedFiles.has(file.id) }" @click="handleFileClick(file, $event)"
            @dblclick="handleFileDoubleClick(file)" @mouseenter="onGridFileItemMouseEnter(file, $event)"
            @mouseleave="onGridFileItemMouseLeave(file, $event)">
            <!-- 列表模式：与首页同行布局 -->
            <template v-if="viewMode === 'list'">
              <div class="file-check">
                <el-checkbox :model-value="selectedFiles.has(file.id)" @click.stop
                  @change="() => toggleSelection(file, true)" />
              </div>
              <div class="file-icon-wrapper">
                <div class="icon-box">
                  <img v-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                    :src="getFilePreviewUrl(file)" class="list-thumbnail" loading="lazy"
                    @error="handleImageError(file.id)" />
                  <FileTypeColoredIcon v-else-if="getFileTypeSymbolId(file)"
                    :name="getFileTypeSymbolId(file)!"
                    size="list" />
                  <el-icon v-else class="file-icon-el" :size="24" :color="getFileIconColor(file)">
                    <component :is="getFileIcon(file)" />
                  </el-icon>
                </div>
              </div>
              <div class="file-info-content">
                <div class="file-name-col">
                  <div class="file-name" :title="file.fileName">{{ file.fileName }}</div>
                </div>
                <div class="file-tags-col">
                  <div v-if="(file.tags?.length || 0) > 0" class="recycle-tags-row">
                    <span
                      v-for="tg in (file.tags || []).slice(0, 6)"
                      :key="tg.id"
                      class="recycle-tag-chip"
                      :style="tagChipStyle(tg)"
                    >{{ tg.tagName }}</span>
                    <span v-if="(file.tags?.length || 0) > 6" class="recycle-tag-more">+{{ (file.tags?.length || 0) - 6 }}</span>
                  </div>
                  <span v-else class="file-tags-empty">—</span>
                </div>
                <div class="file-type-col">{{ typeCategoryLabel(file) }}</div>
                <div class="file-size">{{ file.fileType === 'folder' ? '-' : formatFileSize(file.fileSize || 0) }}
                </div>
                <div class="file-date">{{ formatDate(file.updatedAt) }}</div>
                <div class="file-actions-col">
                  <el-button link type="primary" @click.stop="restoreFile(file)">{{ t('recycleBin.restore')
                  }}</el-button>
                  <el-button link type="primary" @click.stop="openTagDialog(file)">标签</el-button>
                  <el-button link type="danger" @click.stop="permanentDeleteFile(file)">{{
                    t('recycleBin.permanentDelete') }}</el-button>
                </div>
              </div>
            </template>

            <!-- 网格模式 -->
            <template v-else>
              <div class="file-check-grid">
                <el-checkbox :model-value="selectedFiles.has(file.id)" @click.stop
                  @change="() => toggleSelection(file, true)" />
              </div>
              <div class="file-icon">
                <div class="image-thumbnail">
                  <video v-if="file.fileType !== 'folder' && isVideoFile(file) && !videoErrorMap[file.id]"
                    class="file-thumbnail-img file-thumbnail-video" muted playsinline
                    :poster="getFilePreviewUrl(file)" :src="getFileVideoPreviewUrl(file)" preload="none"
                    @timeupdate="onGridVideoTimeUpdate" @ended="onGridVideoEnded"
                    @error="handleVideoError(file.id)" />
                  <img v-else-if="file.fileType !== 'folder' && (isImageFile(file) || isVideoFile(file)) && !imageErrorMap[file.id]"
                    :src="getFilePreviewUrl(file)" class="file-thumbnail-img" loading="lazy"
                    @error="handleImageError(file.id)" />
                  <FileTypeColoredIcon v-else-if="getFileTypeSymbolId(file)"
                    :name="getFileTypeSymbolId(file)!"
                    size="grid" />
                  <el-icon v-else class="file-icon-el" :size="64" :color="getFileIconColor(file)">
                    <component :is="getFileIcon(file)" />
                  </el-icon>
                </div>
              </div>
              <div class="file-info">
                <div class="file-name" :title="file.fileName">{{ file.fileName }}</div>
                <div v-if="(file.tags?.length || 0) > 0" class="recycle-tags-row grid">
                  <span
                    v-for="tg in (file.tags || []).slice(0, 3)"
                    :key="tg.id"
                    class="recycle-tag-chip"
                    :style="tagChipStyle(tg)"
                  >{{ tg.tagName }}</span>
                </div>
                <div class="file-meta">
                  <span v-if="file.fileType === 'file'">{{ formatFileSize(file.fileSize || 0) }}</span>
                  <span>{{ t('recycleBin.header.deletedAt') }}: {{ formatDate(file.updatedAt) }}</span>
                </div>
              </div>
              <div class="file-actions" @click.stop>
                <el-dropdown trigger="click" @command="(cmd) => handleFileAction(cmd, file)">
                  <el-icon>
                    <MoreFilled />
                  </el-icon>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="restore">{{ t('recycleBin.restore') }}</el-dropdown-item>
                      <el-dropdown-item command="tag">标签</el-dropdown-item>
                      <el-dropdown-item divided command="permanentDelete" style="color: #f56c6c;">{{
                        t('recycleBin.permanentDelete') }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty-state">
          <el-icon class="empty-icon" size="64">
            <Delete />
          </el-icon>
          <p class="empty-text">{{ t('recycleBin.emptyState') }}</p>
        </div>

      </el-main>
    </el-container>

    <FileTagDialog
      v-model="tagDialogVisible"
      :files="filesForTagDialog"
      @success="onTagDialogSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Folder,
  Delete, List, Grid, MoreFilled, Document,
  Picture, VideoPlay, Headset, RefreshRight, CaretTop, CaretBottom
} from '@element-plus/icons-vue'
import { useAuthStore } from '@stores/auth'
import fileApiService from '@api/file'
import type { FileItem as FileInfo, FileTagItem, FileQueryParams } from '@typing/file'
import type { FileFilterState, FileFilterFeatures } from '@typing/fileFilter'
import { defaultFileFilterState } from '@typing/fileFilter'
import FileTagDialog from '@components/FileTagDialog/index.vue'
import FileFilterBar from '@components/FileFilterBar/index.vue'
import { formatFileSize } from '@utils/fileUpload'
import { compareFileEntryCategory, getFileEntryCategory } from '@utils/fileCategory'
import { getFileTypeSymbolId } from '@utils/fileTypeIcons'
import FileTypeColoredIcon from '@components/FileTypeColoredIcon/index.vue'
import Sidebar from '@views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import { useI18n } from 'vue-i18n'

const authStore = useAuthStore()
const { t } = useI18n()

const viewMode = ref<'list' | 'grid'>('list')
const files = ref<FileInfo[]>([])
const loading = ref(false)
const selectedFiles = ref<Set<number>>(new Set())
const sortBy = ref<'name' | 'size' | 'time' | 'type'>('time')
const sortOrder = ref<'asc' | 'desc'>('desc')

const fileFilters = reactive<FileFilterState>(defaultFileFilterState())

/** 回收站筛选字段，可按需关闭某项，例如 { fileTypeCategory: false } */
const recycleFilterFeatures = {} as Partial<FileFilterFeatures>

function onFileFiltersUpdate(v: FileFilterState) {
  Object.assign(fileFilters, v)
}

const tagOptions = ref<FileTagItem[]>([])
const tagDialogVisible = ref(false)
const filesForTagDialog = ref<FileInfo[]>([])

const loadTagOptions = async () => {
  try {
    tagOptions.value = await fileApiService.listFileTags()
  } catch {
    /* ignore */
  }
}

const tagChipStyle = (t: FileTagItem) => {
  const c = t.color || '#909399'
  return {
    borderColor: c,
    color: c,
    backgroundColor: `${c}1a`
  }
}

const openTagDialog = (file: FileInfo) => {
  filesForTagDialog.value = [file]
  tagDialogVisible.value = true
}

const openBatchTagDialog = () => {
  const list = files.value.filter((f) => selectedFiles.value.has(f.id))
  if (list.length === 0) return
  filesForTagDialog.value = list
  tagDialogVisible.value = true
}

const onTagDialogSuccess = () => {
  void loadFiles()
  void loadTagOptions()
}

const isImageFile = (file: FileInfo) => {
  return (file.mimeType && file.mimeType.startsWith('image/')) ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.fileName)
}

const isVideoFile = (file: FileInfo) => {
  return (file.mimeType && file.mimeType.startsWith('video/')) ||
    /\.(mp4|webm|ogg|mov|wmv|flv|avi|rmvb|mkv)$/i.test(file.fileName)
}

const isAudioFile = (file: FileInfo) => {
  return (file.mimeType && file.mimeType.startsWith('audio/')) ||
    /\.(mp3|wav|ogg|flac|aac)$/i.test(file.fileName)
}

const getFileIcon = (file: FileInfo) => {
  if (file.fileType === 'folder') return Folder
  if (isImageFile(file)) return Picture
  if (isVideoFile(file)) return VideoPlay
  if (isAudioFile(file)) return Headset
  return Document
}

const getFileIconColor = (file: FileInfo): string => {
  if (file.fileType === 'folder') return '#ffd04b'
  if (isImageFile(file)) return '#67c23a'
  if (isVideoFile(file)) return '#f56c6c'
  if (isAudioFile(file)) return '#e6a23c'
  return '#909399'
}

const getFilePreviewUrl = (file: FileInfo) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  return `${API_BASE_URL}/api/files/${file.id}/thumbnail?token=${encodeURIComponent(token)}`
}

const getFileVideoPreviewUrl = (file: FileInfo) => {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const token = authStore.token || ''
  return `${API_BASE_URL}/api/files/${file.id}/download?preview=true&token=${encodeURIComponent(token)}`
}

const imageErrorMap = ref<Record<number, boolean>>({})
const videoErrorMap = ref<Record<number, boolean>>({})

/** 网格内视频悬停预览：仅循环播放前 10 秒 */
const GRID_VIDEO_PREVIEW_SECONDS = 10

const handleImageError = (fileId: number) => {
  imageErrorMap.value[fileId] = true
}

const handleVideoError = (fileId: number) => {
  videoErrorMap.value[fileId] = true
}

const getGridCardVideo = (e: MouseEvent): HTMLVideoElement | null => {
  const card = e.currentTarget as HTMLElement | null
  if (!card) return null
  const v = card.querySelector('video.file-thumbnail-video')
  return v instanceof HTMLVideoElement ? v : null
}

const onGridFileItemMouseEnter = (file: FileInfo, e: MouseEvent) => {
  if (viewMode.value !== 'grid' || file.fileType === 'folder' || !isVideoFile(file) || videoErrorMap.value[file.id]) {
    return
  }
  const video = getGridCardVideo(e)
  if (!video) return
  video.currentTime = 0
  void video.play().catch(() => {})
}

const onGridFileItemMouseLeave = (file: FileInfo, e: MouseEvent) => {
  if (viewMode.value !== 'grid' || file.fileType === 'folder' || !isVideoFile(file) || videoErrorMap.value[file.id]) {
    return
  }
  const video = getGridCardVideo(e)
  if (!video) return
  video.pause()
  video.currentTime = 0
}

const onGridVideoTimeUpdate = (e: Event) => {
  const v = e.target as HTMLVideoElement
  if (v.currentTime >= GRID_VIDEO_PREVIEW_SECONDS) {
    v.currentTime = 0
  }
}

const onGridVideoEnded = (e: Event) => {
  const v = e.target as HTMLVideoElement
  v.currentTime = 0
  void v.play().catch(() => {})
}

const typeCategoryLabel = (file: FileInfo) => {
  const c = getFileEntryCategory(file)
  return t(`fileList.typeCategory.${c}`)
}

const handleSortChange = (column: 'name' | 'size' | 'time' | 'type') => {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortOrder.value = 'desc'
  }
}

// 计算属性
const filteredFiles = computed(() => {
  const result = [...files.value]
  return result.sort((a: FileInfo, b: FileInfo) => {
    if (sortBy.value !== 'type') {
      if (a.fileType === 'folder' && b.fileType !== 'folder') return -1
      if (a.fileType !== 'folder' && b.fileType === 'folder') return 1
    }

    let compareResult = 0
    switch (sortBy.value) {
      case 'name':
        compareResult = a.fileName.localeCompare(b.fileName, 'zh-CN')
        break
      case 'size':
        compareResult = (a.fileSize || 0) - (b.fileSize || 0)
        break
      case 'type':
        compareResult = compareFileEntryCategory(getFileEntryCategory(a), getFileEntryCategory(b))
        if (compareResult === 0) {
          compareResult = a.fileName.localeCompare(b.fileName, 'zh-CN')
        }
        break
      case 'time':
      default:
        compareResult = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
    }

    return sortOrder.value === 'asc' ? compareResult : -compareResult
  })
})

const isAllSelected = computed(() => {
  const list = filteredFiles.value
  return list.length > 0 && list.every((f) => selectedFiles.value.has(f.id))
})

const isIndeterminate = computed(() => {
  const list = filteredFiles.value
  const n = list.filter((f) => selectedFiles.value.has(f.id)).length
  return n > 0 && n < list.length
})

const toggleSelection = (file: FileInfo, multiSelect = false) => {
  if (multiSelect) {
    if (selectedFiles.value.has(file.id)) {
      selectedFiles.value.delete(file.id)
    } else {
      selectedFiles.value.add(file.id)
    }
  } else {
    selectedFiles.value.clear()
    selectedFiles.value.add(file.id)
  }
}

const clearSelection = () => {
  selectedFiles.value.clear()
}

const selectAll = (checked: boolean) => {
  if (checked) {
    filteredFiles.value.forEach((f) => selectedFiles.value.add(f.id))
  } else {
    filteredFiles.value.forEach((f) => selectedFiles.value.delete(f.id))
  }
}

// 生命周期
onMounted(() => {
  loadFiles()
  loadTagOptions()
})

// 加载文件列表
const loadFiles = async () => {
  try {
    loading.value = true
    const params: FileQueryParams = {}
    if (fileFilters.q?.trim()) params.q = fileFilters.q.trim()
    if (fileFilters.createdFrom) params.createdFrom = fileFilters.createdFrom
    if (fileFilters.createdTo) params.createdTo = fileFilters.createdTo
    if (fileFilters.type && fileFilters.type !== 'all') params.type = fileFilters.type
    if (fileFilters.entryKind && fileFilters.entryKind !== 'all') {
      params.entryKind = fileFilters.entryKind
    }
    if (fileFilters.tagId != null) params.tagId = fileFilters.tagId

    const data = await fileApiService.getRecycleBinFiles(params)
    files.value = data
    clearSelection()
  } catch (error: any) {
    ElMessage.error('加载回收站失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const handleFileClick = (file: FileInfo, event?: MouseEvent) => {
  const multi = !!(event && (event.ctrlKey || event.metaKey))
  toggleSelection(file, multi)
}

const handleFileDoubleClick = (file: FileInfo) => {
  // 回收站内双击暂无操作，或者提示还原
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleString()
}

const handleFileAction = async (command: string, file: FileInfo) => {
  switch (command) {
    case 'restore':
      await restoreFile(file)
      break
    case 'tag':
      openTagDialog(file)
      break
    case 'permanentDelete':
      await permanentDeleteFile(file)
      break
  }
}

// 还原文件
const restoreFile = async (file: FileInfo) => {
  try {
    const message = await fileApiService.restoreFile(file.id)
    ElMessage.success(message || '还原成功')
    selectedFiles.value.delete(file.id)

    // 从列表中移除
    const index = files.value.findIndex((f: FileInfo) => f.id === file.id)
    if (index > -1) {
      files.value.splice(index, 1)
    }
  } catch (error: any) {
    ElMessage.error('还原失败: ' + (error.message || '未知错误'))
  }
}

// 彻底删除文件
const permanentDeleteFile = async (file: FileInfo) => {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除 "${file.fileName}" 吗？此操作无法撤销！`,
      '彻底删除',
      {
        confirmButtonText: '彻底删除',
        cancelButtonText: '取消',
        type: 'warning',
        icon: Delete
      }
    )

    await fileApiService.permanentDeleteFile(file.id)
    selectedFiles.value.delete(file.id)

    // 从列表中移除
    const index = files.value.findIndex(f => f.id === file.id)
    if (index > -1) {
      files.value.splice(index, 1)
    }
    ElMessage.success('已彻底删除')

    // 刷新用户信息以更新存储配额
    authStore.refreshUserInfo()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.message || '未知错误'))
    }
  }
}

const batchRestore = async () => {
  if (selectedFiles.value.size === 0) return
  try {
    await ElMessageBox.confirm(
      t('recycleBin.confirmBatchRestore', { count: selectedFiles.value.size }),
      t('recycleBin.batchRestore'),
      {
        confirmButtonText: t('recycleBin.restore'),
        cancelButtonText: t('common.cancel'),
        type: 'info'
      }
    )
    loading.value = true
    const ids = Array.from(selectedFiles.value)
    const { restoredCount } = await fileApiService.restoreFilesBatch(ids)
    clearSelection()
    await loadFiles()
    ElMessage.success(t('recycleBin.restoredCountMsg', { count: restoredCount }))
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        '未知错误'
      ElMessage.error(msg)
    }
  } finally {
    loading.value = false
  }
}

const batchPermanentDelete = async () => {
  if (selectedFiles.value.size === 0) return
  try {
    await ElMessageBox.confirm(
      t('recycleBin.confirmBatchPermanent', { count: selectedFiles.value.size }),
      t('recycleBin.batchPermanentDelete'),
      {
        confirmButtonText: t('recycleBin.permanentDelete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        icon: Delete
      }
    )
    loading.value = true
    const ids = Array.from(selectedFiles.value)
    const { deletedCount } = await fileApiService.permanentDeleteFilesBatch(ids)
    clearSelection()
    await loadFiles()
    ElMessage.success(t('recycleBin.permanentlyDeletedCountMsg', { count: deletedCount }))
    authStore.refreshUserInfo()
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        '未知错误'
      ElMessage.error(msg)
    }
  } finally {
    loading.value = false
  }
}

// 清空回收站
const handleEmptyRecycleBin = async () => {
  if (files.value.length === 0) return

  try {
    await ElMessageBox.confirm(
      '确定要清空回收站吗？所有文件将无法找回！',
      '清空回收站',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    loading.value = true
    const ids = files.value.map((file) => file.id)
    await fileApiService.permanentDeleteFilesBatch(ids)

    // 重新加载
    await loadFiles()
    ElMessage.success('回收站已清空')

    // 刷新用户信息以更新存储配额
    authStore.refreshUserInfo()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(error)
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        '未知错误'
      ElMessage.error('清空失败: ' + msg)
    }
  } finally {
    loading.value = false
  }
}


</script>

<style lang="scss" scoped>
.index-container {
  display: flex;
  height: 100vh;
  background-color: #f5f7fa;
}

// 左侧导航栏 - 保持一致
.sidebar {
  background-color: #f8f9fa;
  border-right: 1px solid #e4e7ed;

  &-header {
    padding: 20px;
    border-bottom: 1px solid #e4e7ed;
  }

  &-menu {
    border: none;

    .el-menu-item {
      height: 48px;
      line-height: 48px;
    }
  }
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

// 头部
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

    h3 {
      margin: 0;
      font-weight: 500;
      color: #333;
    }
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
    }
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

// 文件内容
.file-content {
  background: white;
  padding: 20px;
  overflow-y: auto;
  position: relative;
}

// 文件列表（列表模式与首页 FileList 列表布局一致）
.file-list {
  &.list {
    .file-list-header {
      display: flex;
      align-items: center;
      padding: 0 10px;
      border-bottom: 1px solid #ebeef5;
      color: #909399;
      font-size: 13px;
      line-height: 40px;

      .header-check {
        width: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .header-icon-spacer {
        width: 44px;
        flex-shrink: 0;
      }

      .header-item {
        &.clickable {
          cursor: pointer;
          display: flex;
          align-items: center;

          &:hover {
            color: #409eff;
          }

          .sort-icon {
            margin-left: 4px;
          }
        }

        &.name {
          flex: 1;
          min-width: 0;
        }

        &.tags {
          width: 200px;
          flex-shrink: 0;
        }

        &.type {
          width: 96px;
          flex-shrink: 0;
        }

        &.size {
          width: 100px;
          flex-shrink: 0;
        }

        &.date {
          width: 160px;
          flex-shrink: 0;
        }

        &.actions {
          width: 300px;
          flex-shrink: 0;
          text-align: right;
        }
      }
    }

    .file-item {
      display: flex;
      align-items: center;
      padding: 10px;
      border-bottom: 1px solid #f0f0f0;
      cursor: pointer;
      transition: background-color 0.2s;

      &.is-selected {
        background-color: #ecf5ff;

        @at-root html.dark & {
          background-color: #2b2b2b;
        }
      }

      &:hover {
        background-color: #f5f7fa;

        @at-root html.dark & {
          background-color: #1d1e1f;
        }
      }

      .file-check {
        width: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 4px;
      }

      .file-icon-wrapper {
        margin-right: 12px;
        width: 32px;
        flex-shrink: 0;

        .icon-box {
          display: flex;
          justify-content: center;
          align-items: center;

          .list-thumbnail {
            width: 32px;
            height: 32px;
            object-fit: cover;
            border-radius: 4px;
          }
        }
      }

      .file-info-content {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;

        .file-name-col {
          flex: 1;
          min-width: 0;
        }

        .file-name {
          font-size: 14px;
          color: #606266;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;

          @at-root html.dark & {
            color: #cfd3dc;
          }
        }

        .file-tags-col {
          width: 200px;
          flex-shrink: 0;
          align-self: center;
          min-width: 0;
          padding-right: 8px;
        }

        .file-type-col {
          width: 96px;
          flex-shrink: 0;
          font-size: 13px;
          color: #909399;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-tags-empty {
          font-size: 13px;
          color: #c0c4cc;
        }

        .recycle-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }

        .recycle-tag-chip {
          font-size: 11px;
          line-height: 1.2;
          padding: 1px 6px;
          border-radius: 3px;
          border: 1px solid;
          max-width: 92px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .recycle-tag-more {
          font-size: 11px;
          color: #909399;
        }

        .file-size {
          width: 100px;
          flex-shrink: 0;
          font-size: 13px;
          color: #909399;
        }

        .file-date {
          width: 160px;
          flex-shrink: 0;
          font-size: 13px;
          color: #909399;
        }

        .file-actions-col {
          width: 300px;
          flex-shrink: 0;
          text-align: right;
        }
      }
    }
  }

  &.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 20px;

    .file-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      position: relative;

      &.is-selected {
        background-color: #ecf5ff;
        outline: 1px solid #d9ecff;

        @at-root html.dark & {
          background-color: #2b2b2b;
          outline-color: #4c4d4f;
        }
      }

      &:hover {
        background-color: #f5f7fa;

        @at-root html.dark & {
          background-color: #1d1e1f;
        }

        .file-actions {
          opacity: 1;
        }
      }

      .file-check-grid {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 3;
      }

      .file-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: center;

        .image-thumbnail {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;

          .file-thumbnail-img,
          .file-thumbnail-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 6px;
          }

          .file-thumbnail-video {
            pointer-events: none;
            background: #000;
          }
        }
      }

      .file-info {
        text-align: center;
        width: 100%;

        .file-name {
          font-size: 14px;
          color: #333;

          @at-root html.dark & {
            color: #CFD3DC;
          }

          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
        }

        .recycle-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          justify-content: center;
          margin-bottom: 4px;
        }

        .recycle-tag-chip {
          font-size: 10px;
          line-height: 1.2;
          padding: 1px 5px;
          border-radius: 3px;
          border: 1px solid;
          max-width: 72px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-meta {
          display: none; // 网格模式下隐藏详细信息
        }
      }

      .file-actions {
        position: absolute;
        top: 8px;
        right: 8px;
        opacity: 0;
        transition: opacity 0.2s;
        background-color: rgba(255, 255, 255, 0.8);
        border-radius: 4px;

        @at-root html.dark & {
          background-color: rgba(0, 0, 0, 0.6);
        }
      }
    }
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;

  .empty-icon {
    margin-bottom: 16px;
  }

  .empty-text {
    font-size: 16px;
    margin: 0;
  }
}

.tag-opt {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
