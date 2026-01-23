import axios from 'axios'
import { useAuthStore } from '../stores/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// 创建axios实例
const fileApi = axios.create({
  baseURL: `${API_BASE_URL}/api/files`,
  timeout: 30000, // 30秒超时，适合大文件上传
})

// 请求拦截器 - 添加认证token
fileApi.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

// 响应拦截器 - 处理token过期
fileApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      // Token过期，跳转登录
      authStore.logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// 文件信息接口
export interface FileInfo {
  id: number
  fileName: string
  fileType: 'file' | 'folder'
  fileSize: number
  mimeType: string
  createdAt: string
  updatedAt: string
}

// 上传进度回调
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

// 分片信息
export interface ChunkInfo {
  chunkIndex: number
  chunkSize: number
  chunkHash: string
  uploaded: boolean
}

// 文件上传相关API
export const fileApiService = {
  // 检查文件是否已存在（秒传检测）
  async checkFileExists(fileHash: string): Promise<{ exists: boolean; fileInfo?: FileInfo }> {
    const response = await fileApi.post('/check-exists', { fileHash })
    return response.data.data // 注意这里要取 data.data
  },

  // 获取已上传的分片列表（断点续传）
  async getUploadedChunks(fileHash: string): Promise<number[]> {
    const response = await fileApi.get(`/chunks/${fileHash}`)
    return response.data.data || []
  },

  // 上传单个分片
  async uploadChunk(
    fileHash: string,
    chunkIndex: number,
    chunkData: Blob,
    chunkHash: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<void> {
    const formData = new FormData()
    formData.append('fileHash', fileHash)
    formData.append('chunkIndex', chunkIndex.toString())
    formData.append('chunkHash', chunkHash)
    formData.append('chunk', chunkData)

    await fileApi.post('/upload-chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100)
          })
        }
      }
    })
  },

  // 合并分片
  async mergeChunks(
    fileHash: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    totalChunks: number,
    parentId?: number
  ): Promise<FileInfo> {
    const response = await fileApi.post('/merge-chunks', {
      fileHash,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      parentId
    })
    return response.data.data
  },

  // 秒传文件（文件已存在）
  async instantUpload(
    fileHash: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    parentId?: number
  ): Promise<FileInfo> {
    const response = await fileApi.post('/instant-upload', {
      fileHash,
      fileName,
      fileSize,
      mimeType,
      parentId
    })
    return response.data.data
  },

  // 获取文件列表
  async getFiles(parentId?: number): Promise<FileInfo[]> {
    const response = await fileApi.get('/', {
      params: { parentId }
    })
    return response.data.data
  },

  // 获取单个文件信息
  async getFileById(id: number): Promise<FileInfo> {
    const response = await fileApi.get(`/${id}`)
    return response.data.data
  },

  // 下载文件
  async downloadFile(id: number): Promise<Blob> {
    const response = await fileApi.get(`/${id}/download`, {
      responseType: 'blob'
    })
    return response.data
  },

  // 删除文件
  async deleteFile(id: number): Promise<void> {
    await fileApi.delete(`/${id}`)
  },

  // 创建文件夹
  async createFolder(name: string, parentId?: number): Promise<FileInfo> {
    const response = await fileApi.post('/folder', {
      name,
      parentId
    })
    return response.data.data
  },

  // 重命名文件/文件夹
  async renameFile(id: number, newName: string): Promise<void> {
    await fileApi.put(`/${id}/rename`, {
      name: newName
    })
  },

  // 移动文件/文件夹
  async moveFile(id: number, targetParentId?: number): Promise<void> {
    await fileApi.put(`/${id}/move`, {
      parentId: targetParentId
    })
  }
}

export default fileApiService