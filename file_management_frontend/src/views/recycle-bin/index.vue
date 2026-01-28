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
        <template #right>
          <el-input v-model="searchText" :placeholder="t('recycleBin.searchPlaceholder')" :prefix-icon="Search"
            style="width: 300px; margin-right: 20px;" @input="handleSearch" />
        </template>
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

      <!-- 文件列表区域 -->
      <el-main class="file-content">
        <!-- 文件列表 -->
        <div v-if="files.length > 0" class="file-list" :class="viewMode">
          <div v-for="file in filteredFiles" :key="file.id" class="file-item" @click="handleFileClick(file)"
            @dblclick="handleFileDoubleClick(file)">
            <div class="file-icon">
              <el-icon size="48" :color="getFileIconColor(file)">
                <Folder v-if="file.fileType === 'folder'" />
                <Document v-else />
              </el-icon>
            </div>
            <div class="file-info">
              <div class="file-name" :title="file.fileName">{{ file.fileName }}</div>
              <div class="file-meta">
                <span v-if="file.fileType === 'file'">{{ formatFileSize(file.fileSize) }}</span>
                <span>删除时间: {{ formatDate(file.updatedAt) }}</span>
              </div>
            </div>
            <div class="file-actions">
              <el-dropdown trigger="click" @command="(cmd) => handleFileAction(cmd, file)">
                <el-icon>
                  <MoreFilled />
                </el-icon>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="restore">{{ t('recycleBin.restore') }}</el-dropdown-item>
                    <el-dropdown-item divided command="permanentDelete" style="color: #f56c6c;">{{
                      t('recycleBin.permanentDelete') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  User, ArrowDown, Folder, Search,
  Clock, Star, Delete, List, Grid, MoreFilled, Document
} from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'
import fileApiService, { type FileInfo } from '../../api/file'
import { formatFileSize } from '../../utils/fileUpload'
import Sidebar from '../index/cpns/Sidebar.vue'
import GlobalHeader from '../../components/GlobalHeader.vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

// 响应式数据
const searchText = ref('')
const viewMode = ref<'list' | 'grid'>('list')
const files = ref<FileInfo[]>([])
const loading = ref(false)

// 计算属性
const filteredFiles = computed(() => {
  let result = files.value

  // 搜索过滤
  if (searchText.value) {
    const keyword = searchText.value.toLowerCase()
    result = result.filter(file =>
      file.fileName.toLowerCase().includes(keyword)
    )
  }

  // 排序：按更新时间(删除时间)倒序
  return result.sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
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
    files.value = await fileApiService.getRecycleBinFiles()
  } catch (error: any) {
    ElMessage.error('加载回收站失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  // 搜索逻辑已在计算属性中处理
}

const handleFileClick = (file: FileInfo) => {
  console.log('选中文件:', file)
}

const handleFileDoubleClick = (file: FileInfo) => {
  // 回收站内双击暂无操作，或者提示还原
}

const getFileIconColor = (file: FileInfo): string => {
  if (file.fileType === 'folder') {
    return '#ffd04b'
  }
  if (file.mimeType.startsWith('image/')) {
    return '#67c23a'
  } else if (file.mimeType.startsWith('video/')) {
    return '#e6a23c'
  } else if (file.mimeType.includes('pdf')) {
    return '#f56c6c'
  } else {
    return '#909399'
  }
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
    case 'permanentDelete':
      await permanentDeleteFile(file)
      break
  }
}

// 还原文件
const restoreFile = async (file: FileInfo) => {
  try {
    await fileApiService.restoreFile(file.id)
    ElMessage.success('还原成功')

    // 从列表中移除
    const index = files.value.findIndex(f => f.id === file.id)
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

    // 由于没有批量删除API，这里只能循环调用或者让后端增加批量API。
    // 为了安全和简单，暂时循环调用（注意文件多时性能问题，但暂无批量API）
    // 或者提示用户只能一个个删？
    // 作为一个完善的功能，应该支持。这里先进行并发删除。
    loading.value = true
    const deletePromises = files.value.map(file => fileApiService.permanentDeleteFile(file.id))
    await Promise.allSettled(deletePromises)

    // 重新加载
    await loadFiles()
    ElMessage.success('回收站已清空')

    // 刷新用户信息以更新存储配额
    authStore.refreshUserInfo()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(error)
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

// Header
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

// Toolbar
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

// File Content
.file-content {
  background: white;
  padding: 20px;
  overflow-y: auto;
  position: relative;
}

// File List
.file-list {
  &.list {
    .file-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      cursor: pointer;
      transition: background-color 0.3s;

      &:hover {
        background-color: #f8f9fa;
      }

      .file-icon {
        margin-right: 16px;
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .file-info {
        flex: 1;
        min-width: 0;

        .file-name {
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-meta {
          font-size: 12px;
          color: #909399;
          display: flex;
          gap: 12px;
        }
      }

      .file-actions {
        margin-left: 16px;
        opacity: 0;
        transition: opacity 0.2s;

        .el-icon {
          font-size: 20px;
          color: #909399;
          cursor: pointer;

          &:hover {
            color: #409eff;
          }
        }
      }

      &:hover .file-actions {
        opacity: 1;
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

      &:hover {
        background-color: #f5f7fa;

        .file-actions {
          opacity: 1;
        }
      }

      .file-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .file-info {
        text-align: center;
        width: 100%;

        .file-name {
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
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
</style>
