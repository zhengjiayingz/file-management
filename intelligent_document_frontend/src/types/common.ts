// 通用响应结构（如果有统一外层包装，目前看来是直接返回数据）
// 这里定义基础的分页参数和响应接口

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResponse<T> {
  list: T[];
  total: number;
  page: number;
  totalPages: number;
}
