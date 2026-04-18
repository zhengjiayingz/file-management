// 操作类型
export type OperationType = 'upload' | 'download' | 'delete' | 'move' | 'rename' | 'create_folder' | 'restore' | 'share' | 'login' | 'logout';

// 日志条目
export interface LogItem {
  id: number;
  userId: number;
  operationType: string;
  resourceType: string;
  resourceId: number | null;
  description: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

// 日志查询参数
export interface LogQueryParams {
  page?: number;
  limit?: number;
  /** 普通日志：与后端一致，表示操作类型；transferOnly 时表示文件类型大类（与首页 FileFilter 一致） */
  type?: string;
  operationType?: string; // 前端组件绑定值
  startDate?: string;
  endDate?: string;
  keyword?: string;
  /** transferOnly 时与文件列表一致 */
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  entryKind?: string;
  tagId?: number;
  targetUserId?: number;
  sortOrder?: 'asc' | 'desc';
  /** 仅当前用户的上传/下载记录，筛选字段与首页 FileFilterBar 一致 */
  transferOnly?: boolean;
}

// 日志列表响应
export interface LogListResponse {
  logs: LogItem[];
  total: number;
  page: number;
  totalPages: number;
}
