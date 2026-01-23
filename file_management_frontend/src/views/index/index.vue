<template>
  <div class="index-container">
    <!-- 左侧导航栏 -->
    <el-aside class="sidebar" width="200px">
      <div class="sidebar-header">
        <h2 class="logo">软件文件</h2>
      </div>
      <el-menu default-active="1" class="sidebar-menu" background-color="#f8f9fa" text-color="#333"
        active-text-color="#409eff">
        <el-menu-item index="1">
          <el-icon>
            <Folder />
          </el-icon>
          <span>首页</span>
        </el-menu-item>
        <el-menu-item index="2">
          <el-icon>
            <Clock />
          </el-icon>
          <span>同步</span>
        </el-menu-item>
        <el-menu-item index="3">
          <el-icon>
            <Star />
          </el-icon>
          <span>收藏</span>
        </el-menu-item>
        <el-menu-item index="4">
          <el-icon>
            <Delete />
          </el-icon>
          <span>回收站</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主要内容区域 -->
    <el-container class="main-container">
      <!-- 顶部工具栏 -->
      <el-header class="header" height="60px">
        <div class="header-content">
          <div class="header-left">
            <el-button-group style="display: flex;">
              <el-upload ref="upload" type="primary" :icon="Upload" :limit="1">
                 <el-button :icon="Upload" type="primary">上传</el-button>
              </el-upload>
              <el-button :icon="FolderAdd">新建文件夹</el-button>
              <el-button :icon="Download">新建文件</el-button>
            </el-button-group>
          </div>
          <div class="header-right">
            <el-input v-model="searchText" placeholder="搜索文件、文件夹" :prefix-icon="Search"
              style="width: 300px; margin-right: 20px;" />
            <el-dropdown @command="handleCommand">
              <span class="user-dropdown">
                <el-icon>
                  <User />
                </el-icon>
                {{ authStore.user?.username }}
                <el-icon class="el-icon--right">
                  <ArrowDown />
                </el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人信息</el-dropdown-item>
                  <el-dropdown-item command="settings">设置</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-header>

      <!-- 文件操作工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>全部</el-breadcrumb-item>
            <!-- <el-breadcrumb-item>产品设计</el-breadcrumb-item> -->
          </el-breadcrumb>
        </div>
        <div class="toolbar-right">
          <el-button-group>
            <el-button :icon="List" @click="viewMode = 'list'"
              :type="viewMode === 'list' ? 'primary' : ''">列表</el-button>
            <el-button :icon="Grid" @click="viewMode = 'grid'"
              :type="viewMode === 'grid' ? 'primary' : ''">网格</el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 文件列表区域 -->
      <el-main class="file-content">
        <div class="file-list">
          <!-- 文件夹列表 -->
          <div class="folder-item" v-for="folder in folders" :key="folder.id">
            <el-icon class="folder-icon" size="48" color="#ffd04b">
              <Folder />
            </el-icon>
            <div class="file-info">
              <div class="file-name">{{ folder.name }}</div>
              <div class="file-meta">{{ folder.date }}</div>
            </div>
            <div class="file-actions">
              <el-dropdown trigger="click">
                <el-icon>
                  <MoreFilled />
                </el-icon>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item>重命名</el-dropdown-item>
                    <el-dropdown-item>移动</el-dropdown-item>
                    <el-dropdown-item>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>

        <!-- 存储空间信息 -->
        <div class="storage-info" v-if="authStore.user">
          <div class="storage-icon">
            <el-icon size="24" color="#409eff">
              <CloudUpload />
            </el-icon>
          </div>
          <div class="storage-text">
            {{ formatStorage(authStore.user.storage_used) }} /
            {{ authStore.user.storage_quota === -1 ? '无限制' : formatStorage(authStore.user.storage_quota) }}
          </div>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  User, ArrowDown, Folder, Upload, Setting, Check,
  Search, FolderAdd, Download, Clock, Star, Delete,
  List, Grid, MoreFilled, Upload as CloudUpload
} from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'
import { computed } from 'vue'

const router = useRouter()
const authStore = useAuthStore()

// 响应式数据
const searchText = ref('')
const viewMode = ref('list')

// 模拟文件夹数据
const folders = ref([
  // { id: 1, name: '360安全卫士', date: '2024/01/11' },
  // { id: 2, name: 'PC 端设计时间', date: '2024/01/04 22:14' },
  // { id: 3, name: '游戏', date: '2024/10/21 14:02' },
  // { id: 4, name: '可行', date: '2024/01/23 19:20' },
  // { id: 5, name: '数据', date: '2024/04/20 23:36' },
  // { id: 6, name: '完成', date: '2024/02/24 09:30' },
  // { id: 7, name: '软件工具', date: '2024/02/24 09:46' },
  // { id: 8, name: '平台自建手机端项目', date: '2023/12/09 14:28' },
  // { id: 9, name: '转换Redis', date: '2023/09/20 22:40' },
  // { id: 10, name: '韩语学Java', date: '2023/09/17 09:49' }
])

// 计算存储使用百分比
const storagePercentage = computed(() => {
  if (!authStore.user) return 0
  return Math.round((authStore.user.storage_used / authStore.user.storage_quota) * 100)
})

// 格式化存储大小
const formatStorage = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 处理下拉菜单命令
const handleCommand = async (command: string) => {
  switch (command) {
    case 'profile':
      ElMessage.info('个人信息功能开发中...')
      break
    case 'settings':
      ElMessage.info('设置功能开发中...')
      break
    case 'logout':
      try {
        if (authStore.refreshToken) {
          await authApi.logout(authStore.refreshToken)
        }
      } catch (error) {
        console.error('登出API调用失败:', error)
      }

      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
      break
  }
}
</script>

<style lang="scss" scoped>
.index-container {
  display: flex;
  height: 100vh;
  background-color: #f5f7fa;
}

// 左侧导航栏
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
    .el-button-group {
      margin-right: 20px;
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

// 文件内容区域
.file-content {
  background: white;
  padding: 20px;
  overflow-y: auto;
}

.file-list {
  margin-bottom: 40px;
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: #f8f9fa;
  }
}

.folder-icon {
  margin-right: 16px;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 12px;
  color: #909399;
}

.file-actions {
  margin-left: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #e4e7ed;
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
    &-left .el-button-group .el-button span {
      display: none;
    }

    &-right .el-input {
      width: 200px !important;
    }
  }
}
</style>