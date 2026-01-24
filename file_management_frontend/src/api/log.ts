
import request from '../utils/request'

export interface LogUser {
  id: number
  username: string
  email: string | null
}

export interface OperationLog {
  id: number
  userId: number
  operationType: string
  resourceType: string
  resourceId: number | null
  description: string | null
  ipAddress: string
  userAgent: string | null
  createdAt: string
  user?: LogUser
}

export interface LogQueryParams {
  page?: number
  limit?: number
  operationType?: string
  startDate?: string
  endDate?: string
  keyword?: string
  targetUserId?: number
  sortOrder?: 'asc' | 'desc'
}

export interface LogResponse {
  data: OperationLog[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export const logApi = {
  getLogs(params: LogQueryParams) {
    return request.get('/logs', { params })
      .then(res => {
        // res is AxiosResponse
        // res.data is the response body: { success: true, data: [...], pagination: {...} }
        return {
          data: res.data?.data || [],
          pagination: res.data?.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 }
        }
      })
  }
}
