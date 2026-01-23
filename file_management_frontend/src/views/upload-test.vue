<template>
  <div class="upload-test">
    <h1>文件上传功能测试</h1>
    
    <!-- 简单上传测试 -->
    <div class="test-section">
      <h2>1. 简单文件上传测试</h2>
      <input type="file" @change="handleFileSelect" multiple />
      <button @click="uploadSelectedFiles" :disabled="!selectedFiles.length || uploading">
        {{ uploading ? '上传中...' : '开始上传' }}
      </button>
      
      <div v-if="selectedFiles.length" class="selected-files">
        <h3>已选择的文件:</h3>
        <ul>
          <li v-for="file in selectedFiles" :key="file.name">
            {{ file.name }} ({{ formatFileSize(file.size) }})
          </li>
        </ul>
      </div>
    </div>

    <!-- 分片上传测试 -->
    <div class="test-section">
      <h2>2. 分片上传组件测试</h2>
      <FileUpload 
        :show-drop-zone="true"
        @upload-success="handleUploadSuccess"
        @upload-error="handleUploadError"
      />
    </div>

    <!-- 测试结果 -->
    <div class="test-results">
      <h2>测试结果</h2>
      <div class="results">
        <h3>成功上传的文件:</h3>
        <ul>
          <li v-for="file in successFiles" :key="file.id || file.name">
            {{ file.fileName || file.name }} - {{ file.message || '上传成功' }}
          </li>
        </ul>
        
        <h3>上传失败的文件:</h3>
        <ul>
          <li v-for="error in errors" :key="error">
            {{ error }}
          </li>
        </ul>
      </div>
    </div>

    <!-- API测试 -->
    <div class="test-section">
      <h2>3. API接口测试</h2>
      <div class="api-buttons">
        <button @click="testCheckExists">测试文件存在检查</button>
        <button @click="testGetFiles">测试获取文件列表</button>
        <button @click="testCreateFolder">测试创建文件夹</button>
      </div>
      
      <div class="api-result">
        <h3>API响应:</h3>
        <pre>{{ apiResult }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import FileUpload from '../components/FileUpload.vue'
import fileApiService from '../api/file'
import { formatFileSize, calculateFileHash } from '../utils/fileUpload'

// 响应式数据
const selectedFiles = ref<File[]>([])
const uploading = ref(false)
const successFiles = ref<any[]>([])
const errors = ref<string[]>([])
const apiResult = ref('')

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files) {
    selectedFiles.value = Array.from(target.files)
  }
}

// 上传选中的文件（简单上传测试）
const uploadSelectedFiles = async () => {
  if (!selectedFiles.value.length) return

  uploading.value = true
  
  for (const file of selectedFiles.value) {
    try {
      // 计算文件哈希
      const fileHash = await calculateFileHash(file)
      
      // 检查文件是否存在
      const existsResult = await fileApiService.checkFileExists(fileHash)
      
      if (existsResult.exists) {
        // 秒传
        const result = await fileApiService.instantUpload(
          fileHash,
          file.name,
          file.size,
          file.type
        )
        successFiles.value.push({
          name: file.name,
          message: '秒传成功',
          ...result
        })
      } else {
        // 这里可以实现简单的单文件上传逻辑
        // 暂时显示需要分片上传
        successFiles.value.push({
          name: file.name,
          message: '需要使用分片上传组件'
        })
      }
    } catch (error: any) {
      errors.value.push(`${file.name}: ${error.message}`)
    }
  }
  
  uploading.value = false
  selectedFiles.value = []
}

// 处理上传成功
const handleUploadSuccess = (file: any) => {
  successFiles.value.push(file)
  ElMessage.success(`文件上传成功: ${file.fileName}`)
}

// 处理上传错误
const handleUploadError = (error: string) => {
  errors.value.push(error)
  ElMessage.error(`上传失败: ${error}`)
}

// API测试函数
const testCheckExists = async () => {
  try {
    const result = await fileApiService.checkFileExists('test-hash-123')
    apiResult.value = JSON.stringify(result, null, 2)
    ElMessage.success('API测试成功')
  } catch (error: any) {
    apiResult.value = `错误: ${error.message}`
    ElMessage.error('API测试失败')
  }
}

const testGetFiles = async () => {
  try {
    const result = await fileApiService.getFiles()
    apiResult.value = JSON.stringify(result, null, 2)
    ElMessage.success('获取文件列表成功')
  } catch (error: any) {
    apiResult.value = `错误: ${error.message}`
    ElMessage.error('获取文件列表失败')
  }
}

const testCreateFolder = async () => {
  try {
    const result = await fileApiService.createFolder('测试文件夹-' + Date.now())
    apiResult.value = JSON.stringify(result, null, 2)
    ElMessage.success('创建文件夹成功')
  } catch (error: any) {
    apiResult.value = `错误: ${error.message}`
    ElMessage.error('创建文件夹失败')
  }
}
</script>

<style lang="scss" scoped>
.upload-test {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  h1 {
    color: #303133;
    margin-bottom: 30px;
    text-align: center;
  }

  h2 {
    color: #606266;
    margin: 30px 0 15px 0;
    font-size: 18px;
    border-bottom: 2px solid #409eff;
    padding-bottom: 5px;
  }

  h3 {
    color: #909399;
    margin: 15px 0 10px 0;
    font-size: 16px;
  }

  .test-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    input[type="file"] {
      margin-bottom: 10px;
    }

    button {
      padding: 8px 16px;
      background: #409eff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;

      &:disabled {
        background: #c0c4cc;
        cursor: not-allowed;
      }

      &:hover:not(:disabled) {
        background: #66b1ff;
      }
    }

    .selected-files {
      margin-top: 15px;
      padding: 10px;
      background: #f5f7fa;
      border-radius: 4px;

      ul {
        margin: 5px 0;
        padding-left: 20px;
      }
    }
  }

  .test-results {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    background: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

    .results {
      ul {
        margin: 10px 0;
        padding-left: 20px;
        color: #606266;

        li {
          margin-bottom: 5px;
        }
      }
    }
  }

  .api-buttons {
    margin-bottom: 20px;

    button {
      padding: 8px 16px;
      background: #67c23a;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
      margin-bottom: 10px;

      &:hover {
        background: #85ce61;
      }
    }
  }

  .api-result {
    pre {
      background: #f5f7fa;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e4e7ed;
      font-size: 12px;
      color: #303133;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 300px;
      overflow-y: auto;
    }
  }
}
</style>