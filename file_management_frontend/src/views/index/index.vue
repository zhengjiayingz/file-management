<template>
  <div class="index-container">
    <!-- 顶部导航栏 -->
    <el-header class="header">
      <div class="header-content">
        <h1 class="logo">文件管理系统</h1>
        <div class="user-info">
          <el-dropdown @command="handleCommand" @visible-change="onDropdownVisibleChange">
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
                <el-dropdown-item divided command="logout" @click="directLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-header>

    <!-- 主要内容区域 -->
    <el-main class="main-content">
      <div class="welcome-section">
        <el-card class="welcome-card">
          <template #header>
            <div class="card-header">
              <span>欢迎回来，{{ authStore.user?.username }}！</span>
            </div>
          </template>
          <div class="welcome-content">
            <p>这是文件管理系统的主页面</p>
            <p>您已成功登录系统</p>
          </div>
        </el-card>
      </div>

      <!-- 功能区域 -->
      <div class="features-section">


        <el-row :gutter="20">
          <el-col :span="8">
            <el-card class="feature-card" shadow="hover">
              <div class="feature-icon">
                <el-icon size="40" color="#409eff">
                  <Folder />
                </el-icon>
              </div>
              <h3>文件管理</h3>
              <p>管理您的文件和文件夹</p>
              <el-button type="primary" plain>进入管理</el-button>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card class="feature-card" shadow="hover">
              <div class="feature-icon">
                <el-icon size="40" color="#67c23a">
                  <Upload />
                </el-icon>
              </div>
              <h3>文件上传</h3>
              <p>上传新的文件到系统</p>
              <el-button type="success" plain>开始上传</el-button>
            </el-card>
          </el-col>

          <el-col :span="8">
            <el-card class="feature-card" shadow="hover">
              <div class="feature-icon">
                <el-icon size="40" color="#e6a23c">
                  <Setting />
                </el-icon>
              </div>
              <h3>系统设置</h3>
              <p>配置系统参数和选项</p>
              <el-button type="warning" plain>进入设置</el-button>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- 统计信息 -->
      <div class="stats-section">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-card class="stat-card">
              <el-statistic title="总文件数" :value="1234" />
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card class="stat-card">
              <el-statistic title="存储空间" :value="2.5" suffix="GB" />
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card class="stat-card">
              <el-statistic title="今日上传" :value="56" />
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card class="stat-card">
              <el-statistic title="在线用户" :value="8" />
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, ArrowDown, Folder, Upload, Setting } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// 下拉菜单可见性变化
const onDropdownVisibleChange = (visible: boolean) => {
  console.log('下拉菜单可见性变化:', visible)
}

// 直接退出登录（用于下拉菜单项的点击事件）
const directLogout = () => {
  console.log('直接退出登录被点击')
  console.log('开始执行退出登录')

  authStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')

  console.log('退出登录完成')
}

// 处理下拉菜单命令
const handleCommand = (command: string) => {
  console.log('下拉菜单命令:', command)

  switch (command) {
    case 'profile':
      ElMessage.info('个人信息功能开发中...')
      break
    case 'settings':
      ElMessage.info('设置功能开发中...')
      break
    case 'logout':
      console.log('通过command处理退出登录')
      authStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
      break
    default:
      console.log('未知命令:', command)
  }
}
</script>

<style scoped>
.index-container {
  min-height: 100vh;
  background-color: #f5f7fa;
}

.header {
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
}

.logo {
  color: #409eff;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.user-dropdown {
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
}

.user-dropdown .el-icon {
  margin: 0 4px;
}

.main-content {
  padding: 20px;
}

.welcome-section {
  margin-bottom: 20px;
}

.welcome-card .card-header {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.welcome-content {
  color: #606266;
  line-height: 1.6;
}

.features-section {
  margin-bottom: 30px;
}

.feature-card {
  text-align: center;
  padding: 20px;
  transition: transform 0.3s;
}

.feature-card:hover {
  transform: translateY(-5px);
}

.feature-icon {
  margin-bottom: 15px;
}

.feature-card h3 {
  margin: 15px 0 10px 0;
  color: #303133;
  font-size: 18px;
}

.feature-card p {
  color: #909399;
  margin-bottom: 20px;
  font-size: 14px;
}

.stats-section .stat-card {
  text-align: center;
}

:deep(.el-statistic__content) {
  font-size: 28px;
  font-weight: 600;
}

:deep(.el-statistic__title) {
  font-size: 14px;
  color: #909399;
  margin-bottom: 10px;
}
</style>