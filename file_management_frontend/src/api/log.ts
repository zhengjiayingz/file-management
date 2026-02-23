
import request from '@utils/request'
import type { LogQueryParams, LogListResponse } from '@typing/log'

export const logApi = {
  async getLogs(params: LogQueryParams): Promise<LogListResponse> {
    const res = await request.get<any>('/logs', { params })
    // 后端返回结构: { success: true, data: [...], pagination: { total, page, limit, totalPages } }
    // 前端接口定义: { logs: [], total: number, page: number, totalPages: number }
    return {
      logs: res.data.data,
      total: res.data.pagination.total,
      page: res.data.pagination.page,
      totalPages: res.data.pagination.totalPages
    }
  }
}

export default logApi
