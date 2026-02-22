import request from '../utils/request'

export const userApi = {
    search(keyword: string) {
        return request.get('/user/search', { params: { keyword } })
    }
}
export default userApi
