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
  type?: string; // 后端 API 参数
  operationType?: string; // 前端组件绑定值
  startDate?: string;
  endDate?: string;
  keyword?: string;
  targetUserId?: number;
  sortOrder?: 'asc' | 'desc';
}

// 日志列表响应
export interface LogListResponse {
  logs: LogItem[];
  total: number;
  page: number;
  totalPages: number;
}
