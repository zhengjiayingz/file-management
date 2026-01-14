<template>
  <div class="test-container">
    <el-card class="test-card">
      <template #header>
        <div class="card-header">
          <span>数据库连接测试</span>
        </div>
      </template>

      <div class="test-section">
        <h3>🔌 测试数据库连接</h3>
        <p>点击按钮测试后端是否能连接到 MySQL 数据库</p>
        <el-button 
          type="primary" 
          @click="testConnection"
          :loading="loading"
          size="large"
        >
          测试连接
        </el-button>

        <div v-if="connectionResult" class="result-box">
          <el-alert
            :type="connectionResult.success ? 'success' : 'error'"
            :title="connectionResult.message"
            :closable="false"
            show-icon
          />
          
          <div v-if="connectionResult.success" class="result-detail">
            <h4>✅ 连接信息：</h4>
            <pre>{{ JSON.stringify(connectionResult.info, null, 2) }}</pre>
          </div>
          
          <div v-else class="result-detail">
            <h4>❌ 错误信息：</h4>
            <pre>{{ connectionResult.error }}</pre>
            <p v-if="connectionResult.code">错误代码: {{ connectionResult.code }}</p>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="test-section">
        <h3>📝 创建测试表</h3>
        <p>在数据库中创建一个测试表并插入数据</p>
        <el-button 
          type="success" 
          @click="createTable"
          :loading="loading"
          size="large"
        >
          创建测试表
        </el-button>

        <div v-if="tableResult" class="result-box">
          <el-alert
            :type="tableResult.success ? 'success' : 'error'"
            :title="tableResult.message"
            :closable="false"
            show-icon
          />
          
          <div v-if="tableResult.success" class="result-detail">
            <h4>✅ 测试数据：</h4>
            <pre>{{ JSON.stringify(tableResult.data, null, 2) }}</pre>
            <p class="tip">💡 你可以在 MySQL 中执行 <code>SELECT * FROM test_connection;</code> 查看数据</p>
          </div>
          
          <div v-else class="result-detail">
            <h4>❌ 错误信息：</h4>
            <pre>{{ tableResult.error }}</pre>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="test-section">
        <h3>🎯 Prisma ORM 测试</h3>
        <p>使用 Prisma ORM 向 files 表插入数据</p>
        
        <div class="button-group">
          <el-button 
            type="primary" 
            @click="createFileWithPrisma"
            :loading="loading"
            size="large"
          >
            创建文件记录
          </el-button>
          
          <el-button 
            type="info" 
            @click="getFilesList"
            :loading="loading"
            size="large"
          >
            查看文件列表
          </el-button>
          
          <el-button 
            type="danger" 
            @click="clearTestFiles"
            :loading="loading"
            size="large"
          >
            清空测试文件
          </el-button>
        </div>

        <div v-if="prismaResult" class="result-box">
          <el-alert
            :type="prismaResult.success ? 'success' : 'error'"
            :title="prismaResult.message"
            :closable="false"
            show-icon
          />
          
          <div v-if="prismaResult.success" class="result-detail">
            <h4>✅ 创建的文件记录：</h4>
            <pre>{{ JSON.stringify(prismaResult.data, null, 2) }}</pre>
          </div>
          
          <div v-else class="result-detail">
            <h4>❌ 错误信息：</h4>
            <pre>{{ prismaResult.error }}</pre>
          </div>
        </div>

        <div v-if="filesList" class="result-box">
          <el-alert
            :type="filesList.success ? 'success' : 'error'"
            :title="filesList.message"
            :closable="false"
            show-icon
          />
          
          <div v-if="filesList.success && filesList.data" class="result-detail">
            <h4>📋 文件列表（共 {{ filesList.total }} 条）：</h4>
            <el-table :data="filesList.data" border style="width: 100%; margin-top: 10px;">
              <el-table-column prop="id" label="ID" width="60" />
              <el-table-column prop="originalName" label="文件名" width="200" />
              <el-table-column prop="mimetype" label="类型" width="120" />
              <el-table-column prop="size" label="大小" width="100" />
              <el-table-column prop="user.username" label="上传用户" width="120" />
              <el-table-column prop="createdAt" label="创建时间" width="180">
                <template #default="{ row }">
                  {{ new Date(row.createdAt).toLocaleString() }}
                </template>
              </el-table-column>
            </el-table>
            <p class="tip">💡 你可以在 MySQL 中执行 <code>SELECT * FROM files;</code> 查看数据</p>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="info-section">
        <h4>📋 使用说明：</h4>
        <ol>
          <li>确保 MySQL 服务已启动</li>
          <li>确保 <code>.env</code> 文件中的 <code>DATABASE_URL</code> 配置正确</li>
          <li>在后端目录运行: <code>npm install mysql2</code></li>
          <li>启动测试服务器: <code>npm run test-server</code></li>
          <li>点击上面的按钮进行测试</li>
        </ol>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000'

const loading = ref(false)
const connectionResult = ref<any>(null)
const tableResult = ref<any>(null)
const prismaResult = ref<any>(null)
const filesList = ref<any>(null)

// 测试数据库连接
const testConnection = async () => {
  loading.value = true
  connectionResult.value = null
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/test/connection`)
    connectionResult.value = response.data
    
    if (response.data.success) {
      ElMessage.success('数据库连接成功！')
    } else {
      ElMessage.error('数据库连接失败！')
    }
  } catch (error: any) {
    ElMessage.error('请求失败：' + (error.message || '未知错误'))
    connectionResult.value = {
      success: false,
      message: '请求失败',
      error: error.message
    }
  } finally {
    loading.value = false
  }
}

// 创建测试表
const createTable = async () => {
  loading.value = true
  tableResult.value = null
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/test/create-table`)
    tableResult.value = response.data
    
    if (response.data.success) {
      ElMessage.success('测试表创建成功！')
    } else {
      ElMessage.error('测试表创建失败！')
    }
  } catch (error: any) {
    ElMessage.error('请求失败：' + (error.message || '未知错误'))
    tableResult.value = {
      success: false,
      message: '请求失败',
      error: error.message
    }
  } finally {
    loading.value = false
  }
}

// 使用 Prisma ORM 创建文件记录
const createFileWithPrisma = async () => {
  loading.value = true
  prismaResult.value = null
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/test/files`)
    prismaResult.value = response.data
    
    if (response.data.success) {
      ElMessage.success('文件记录创建成功！')
      // 自动刷新文件列表
      await getFilesList()
    } else {
      ElMessage.error('文件记录创建失败！')
    }
  } catch (error: any) {
    ElMessage.error('请求失败：' + (error.message || '未知错误'))
    prismaResult.value = {
      success: false,
      message: '请求失败',
      error: error.message
    }
  } finally {
    loading.value = false
  }
}

// 获取文件列表
const getFilesList = async () => {
  loading.value = true
  filesList.value = null
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/test/files`)
    filesList.value = response.data
    
    if (response.data.success) {
      ElMessage.success(`获取到 ${response.data.total} 条文件记录`)
    }
  } catch (error: any) {
    ElMessage.error('获取文件列表失败：' + (error.message || '未知错误'))
    filesList.value = {
      success: false,
      message: '请求失败',
      error: error.message
    }
  } finally {
    loading.value = false
  }
}

// 清空测试文件
const clearTestFiles = async () => {
  loading.value = true
  
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/test/files`)
    
    if (response.data.success) {
      ElMessage.success(response.data.message)
      // 刷新文件列表
      await getFilesList()
    }
  } catch (error: any) {
    ElMessage.error('清空失败：' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.test-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.test-card {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.card-header {
  font-size: 20px;
  font-weight: bold;
}

.test-section {
  margin-bottom: 30px;
}

.test-section h3 {
  margin-bottom: 10px;
  color: #409eff;
}

.test-section p {
  margin-bottom: 15px;
  color: #606266;
}

.result-box {
  margin-top: 20px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.result-detail {
  margin-top: 15px;
}

.result-detail h4 {
  margin-bottom: 10px;
}

.result-detail pre {
  background-color: #fff;
  padding: 15px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}

.result-detail code {
  background-color: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
}

.tip {
  margin-top: 10px;
  padding: 10px;
  background-color: #e6f7ff;
  border-left: 3px solid #1890ff;
  border-radius: 4px;
}

.info-section {
  background-color: #f0f9ff;
  padding: 15px;
  border-radius: 4px;
  border-left: 4px solid #409eff;
}

.info-section h4 {
  margin-bottom: 10px;
  color: #409eff;
}

.info-section ol {
  margin-left: 20px;
  line-height: 2;
}

.info-section code {
  background-color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  color: #e83e8c;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
