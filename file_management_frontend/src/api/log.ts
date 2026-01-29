
import request from '../utils/request'
import type { LogQueryParams, LogListResponse } from '../types/log'

export const logApi = {
  async getLogs(params: LogQueryParams): Promise<LogListResponse> {
    const res = await request.get<LogListResponse>('/logs', { params })
    return res.data
  }
}

export default logApi
