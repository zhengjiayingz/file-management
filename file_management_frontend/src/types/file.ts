// 文件类型枚举
export type FileType = 'file' | 'folder';

// 存储信息接口
export interface FileStorage {
  fileSize: number;
  mimeType: string;
}

// 文件/文件夹基本信息
export interface FileItem {
  id: number;
  userId: number;
  parentId: number | null;
  fileName: string;
  fileType: FileType;
  storage?: FileStorage;
  mimeType?: string; // 某些接口可能直接返回 mimeType
  fileSize?: number; // 某些接口可能直接返回 fileSize
  isDeleted: boolean;
  createdAt: string; // ISO 日期字符串
  updatedAt: string;
  deletedAt?: string | null;
}

// 文件列表查询参数
export interface FileQueryParams {
  parentId?: number | string; // 'root' 或数字 ID
  type?: 'all' | 'image' | 'video' | 'document' | 'audio' | 'other';
  sort?: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'size_asc' | 'size_desc';
  isDeleted?: boolean;
  q?: string;
}

// 检查文件是否存在响应
export interface CheckFileExistsResponse {
  exists: boolean;
  file?: FileItem; // 如果存在，可能返回文件信息
}

// 创建文件夹参数
export interface CreateFolderParams {
  folderName: string;
  parentId: number | null;
}

// 重命名参数
export interface RenameFileParams {
  newName: string;
}

// 移动文件参数
export interface MoveFileParams {
  targetParentId: number | null;
}

// 上传进度回调类型
export type OnUploadProgress = (progressEvent: any) => void;
