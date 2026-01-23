<template>
  <div class="test-upload-page">
    <h1>文件上传功能测试</h1>
    
    <div class="test-section">
      <h2>基本上传测试</h2>
      <FileUpload 
        :show-drop-zone="true"
        @upload-success="handleUploadSuccess"
        @upload-error="handleUploadError"
        @queue-change="handleQueueChange"
      />
    </div>

    <div class="test-results">
      <h2>测试结果</h2>
      <div class="result-item">
        <strong>上传成功的文件:</strong>
        <ul>
          <li v-for="file in successFiles" :key="file.id">
            {{ file.fileName }} ({{ formatFileSize(file.fileSize) }})
          </li>
        </ul>
      </div>
      
      <div class="result-item">
        <strong>上传失败的文件:</strong>
        <ul>
          <li v-for="error in errorMessages" :key="error">
            {{ error }}
          </li>
        </ul>
      </div>
      
      <div class="result-item">
        <strong>队列状态:</strong>
        <p>当前队列中有 {{ queueCount }} 个文件</p>
      </div>
    </div>

    <div class="api-test">
      <h2>API测试</h2>
      <el-button @click="testCheckExists">测试文件存在检查</el-button>
      <el-button @click="testGetFiles">测试获取文件列表</el-button>
      <el-button @click="testCreateFolder">测试创建文件夹</el-button>
      
      <div class="api-results">
        <pre>{{ apiResults }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import FileUpload from '../components/FileUpload.vue'
import fileApiService from '../api/file'
import { formatFileSize } from '../utils/fileUpload'

// 响应式数据
const successFiles = ref<any[]>([])
const errorMessages = ref<string[]>([])
const queueCount = ref(0)
const apiResults = ref('')

// 处理上传成功
const handleUploadSuccess = (file: any) => {
  successFiles.value.push(file)
  ElMessage.success(`文件上传成功: ${file.fileName}`)
}

// 处理上传错误
const handleUploadError = (error: string) => {
  errorMessages.value.push(error)
  ElMessage.error(`上传失败: ${error}`)
}

// 处理队列变化
const handleQueueChange = (count: number) => {
  queueCount.value = count
}

// API测试函数
const testCheckExists = async () => {
  try {
    const result = await fileApiService.checkFileExists('test-hash-123')
    apiResults.value = JSON.stringify(result, null, 2)
    ElMessage.success('API测试成功')
  } catch (error: any) {
    apiResults.value = `错误: ${error.message}`
    ElMessage.error('API测试失败')
  }
}

const testGetFiles = async () => {
  try {
    const result = await fileApiService.getFiles()
    apiResults.value = JSON.stringify(result, null, 2)
    ElMessage.success('获取文件列表成功')
  } catch (error: any) {
    apiResults.value = `错误: ${error.message}`
    ElMessage.error('获取文件列表失败')
  }
}

const testCreateFolder = async () => {
  try {
    const result = await fileApiService.createFolder('测试文件夹')
    apiResults.value = JSON.stringify(result, null, 2)
    ElMessage.success('创建文件夹成功')
  } catch (error: any) {
    apiResults.value = `错误: ${error.message}`
    ElMessage.error('创建文件夹失败')
  }
}
</script>

<style lang="scss" scoped>
.test-upload-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  h1 {
    color: #303133;
    margin-bottom: 30px;
  }

  h2 {
    color: #606266;
    margin: 20px 0 15px 0;
    font-size: 18px;
  }

  .test-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: white;
  }

  .test-results {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: white;

    .result-item {
      margin-bottom: 20px;

      strong {
        color: #303133;
        display: block;
        margin-bottom: 8px;
      }

      ul {
        margin: 0;
        padding-left: 20px;
        color: #606266;
      }

      p {
        margin: 0;
        color: #606266;
      }
    }
  }

  .api-test {
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: white;

    .el-button {
      margin-right: 10px;
      margin-bottom: 10px;
    }

    .api-results {
      margin-top: 20px;
      padding: 15px;
      background: #f5f7fa;
      border-radius: 4px;
      border: 1px solid #e4e7ed;

      pre {
        margin: 0;
        font-size: 12px;
        color: #303133;
        white-space: pre-wrap;
        word-break: break-all;
      }
    }
  }
}
</style>