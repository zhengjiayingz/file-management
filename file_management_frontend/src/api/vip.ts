import request from '@utils/request'

export interface VipPendingItem {
  id: number
  applicantId: number
  username: string
  email: string | null
  createdAt: string
}

export const vipApi = {
  async apply(): Promise<{ message: string }> {
    const res = await request.post<{ success: boolean; message: string }>('/vip/apply')
    return { message: res.data.message }
  },

  async getMyStatus(): Promise<{ hasPending: boolean; pendingId: number | null; role: string }> {
    const res = await request.get<{
      success: boolean
      data: { hasPending: boolean; pendingId: number | null; role: string }
    }>('/vip/my-status')
    return res.data.data
  },

  async listPending(): Promise<VipPendingItem[]> {
    const res = await request.get<{ success: boolean; data: VipPendingItem[] }>('/vip/pending')
    return res.data.data
  },

  async approve(requestId: number): Promise<void> {
    await request.post(`/vip/requests/${requestId}/approve`)
  },

  async reject(requestId: number): Promise<void> {
    await request.post(`/vip/requests/${requestId}/reject`)
  },

  /** 管理员在聊天中按申请人 ID 操作 */
  async approveByApplicant(applicantId: number): Promise<void> {
    await request.post(`/vip/applicant/${applicantId}/approve`)
  },

  async rejectByApplicant(applicantId: number): Promise<void> {
    await request.post(`/vip/applicant/${applicantId}/reject`)
  }
}
