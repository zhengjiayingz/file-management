// 文件类型枚举
export type FileType = 'file' | 'folder';

/** 列表 MIME 大类（与后端 type 查询一致） */
export type FileTypeCategory = 'all' | 'image' | 'video' | 'document' | 'audio' | 'other';

// 存储信息接口
export interface FileStorage {
  fileSize: number;
  mimeType: string;
}

/** 用户自定义文件标签 */
export interface FileTagItem {
  id: number;
  tagName: string;
  color: string | null;
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
  /** 后端列表/详情返回的关联标签 */
  tags?: FileTagItem[];
}

// 文件列表查询参数
export interface FileQueryParams {
  parentId?: number | string; // 根目录可传空字符串，由后端解析为 null
  type?: FileTypeCategory;
  sort?: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc' | 'size_asc' | 'size_desc';
  isDeleted?: boolean;
  q?: string;
  /** 仅列出包含该标签的文件 */
  tagId?: number;
  /** 上传时间起（YYYY-MM-DD），对应后端 created_at */
  createdFrom?: string;
  /** 上传时间止（YYYY-MM-DD，含当日） */
  createdTo?: string;
  /** 条目种类：仅文件 / 仅文件夹 */
  entryKind?: 'all' | 'file' | 'folder';
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
