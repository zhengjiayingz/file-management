import request from '@utils/request'

export const messageApi = {
    getUnreadSummary() {
        return request.get('/messages/unread-summary')
    },
    getHistory(friendId: number) {
        return request.get(`/messages/${friendId}`)
    },
    send(data: { receiverId: number; content: string; messageType?: string; fileId?: number }) {
        return request.post('/messages', data)
    },
    markAsRead(friendId: number) {
        return request.put(`/messages/${friendId}/read`)
    }
}
export default messageApi
