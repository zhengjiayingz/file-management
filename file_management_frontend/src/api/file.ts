import request from '../utils/request'
import type { 
  FileItem, 
  CheckFileExistsResponse, 
  CreateFolderParams, 
  RenameFileParams, 
  MoveFileParams,
  FileQueryParams
} from '../types/file'

// 上传进度回调类型
export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

// 文件上传相关API
export const fileApiService = {
  // 检查文件是否已存在（秒传检测）
  async checkFileExists(fileHash: string): Promise<CheckFileExistsResponse> {
    const res = await request.post<any>('/files/check-exists', { fileHash })
    return res.data.data
  },

  // 获取已上传的分片列表（断点续传）
  async getUploadedChunks(fileHash: string): Promise<number[]> {
    const res = await request.get<any>(`/files/chunks/${fileHash}`)
    return res.data.data || []
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

    await request.post('/files/upload-chunk', formData, {
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
    parentId?: number,
    conflictAction?: 'rename' | 'override' | 'version'
  ): Promise<FileItem> {
    const res = await request.post<any>('/files/merge-chunks', {
      fileHash,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      parentId,
      conflictAction
    })
    return res.data.data
  },

  // 秒传文件（文件已存在）
  async instantUpload(
    fileHash: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    parentId?: number,
    conflictAction?: 'rename' | 'override' | 'version'
  ): Promise<FileItem> {
    const res = await request.post<any>('/files/instant-upload', {
      fileHash,
      fileName,
      fileSize,
      mimeType,
      parentId,
      conflictAction
    })
    return res.data.data
  },

  // 检查文件名是否存在
  async checkFileName(fileName: string, parentId?: number): Promise<{ exists: boolean }> {
      const res = await request.post<any>('/files/check-name', { fileName, parentId });
      return res.data;
  },

  // 获取文件历史版本
  async getFileVersions(id: number): Promise<any[]> {
      const res = await request.get<any>(`/files/${id}/versions`);
      return res.data.data;
  },

  // 回滚版本
  async rollbackVersion(id: number, versionId: number): Promise<void> {
      await request.post(`/files/${id}/versions/${versionId}/rollback`);
  },

  // 简单文件上传
  async uploadFile(file: File, parentId?: number, onProgress?: (percentage: number) => void): Promise<FileItem> {
    const formData = new FormData()
    formData.append('file', file)
    if (parentId) formData.append('parentId', parentId.toString())

    const res = await request.post<any>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        }
      }
    })
    return res.data.data
  },

  // 获取文件列表
  async getFiles(params: FileQueryParams): Promise<FileItem[]> {
    const res = await request.get<any>('/files', { params })
    return res.data.data
  },

  // 获取回收站文件列表
  async getRecycleBinFiles(): Promise<FileItem[]> {
    const res = await request.get<any>('/files', {
      params: { isDeleted: true }
    })
    return res.data.data
  },

  // 获取单个文件信息
  async getFileById(id: number): Promise<FileItem> {
    const res = await request.get<any>(`/files/${id}`)
    return res.data.data
  },

  // 下载文件
  async downloadFile(id: number): Promise<Blob> {
    const res = await request.get(`/files/${id}/download`, {
      responseType: 'blob'
    })
    return res.data as Blob
  },

  // 删除文件（移入回收站）
  async deleteFile(id: number): Promise<void> {
    await request.delete(`/files/${id}`)
  },

  // 还原文件
  async restoreFile(id: number): Promise<string> {
    const res = await request.post<any>(`/files/${id}/restore`)
    return res.data.message
  },

  // 彻底删除文件
  async permanentDeleteFile(id: number): Promise<void> {
    await request.delete(`/files/${id}/permanent`)
  },

  // 创建文件夹
  async createFolder(name: string, parentId?: number): Promise<FileItem> {
    const data = { name, parentId: parentId || null }
    const res = await request.post<any>('/files/folder', data)
    return res.data.data
  },

  // 重命名文件/文件夹
  async renameFile(id: number, name: string): Promise<void> {
    const data = { name }
    await request.put(`/files/${id}/rename`, data)
  },

  // 移动文件/文件夹
  async moveFile(id: number, parentId?: number): Promise<void> {
    const data = { parentId: parentId || null }
    await request.put(`/files/${id}/move`, data)
  }
}

export default fileApiService