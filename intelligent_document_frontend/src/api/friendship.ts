import request from '@utils/request'

export const friendshipApi = {
    getFriends() {
        return request.get('/friendships')
    },
    getPendingRequests() {
        return request.get('/friendships/requests/pending')
    },
    sendRequest(data: { friendUsername?: string; friendId?: number }) {
        return request.post('/friendships/request', data)
    },
    acceptRequest(requestId: number) {
        return request.put(`/friendships/request/${requestId}/accept`)
    },
    rejectRequest(requestId: number) {
        return request.put(`/friendships/request/${requestId}/reject`)
    },
    removeFriend(friendId: number) {
        return request.delete(`/friendships/${friendId}`)
    }
}
export default friendshipApi
