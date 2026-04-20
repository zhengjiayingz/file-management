import request from '@utils/request';

// 仪表盘统计数据接口
export interface DashboardStats {
    users: {
        total: number;
        active: number;
        roles: Record<string, number>;
    };
    storage: {
        totalUsed: string; // BigInt as string
        ranking: Array<{
            id: number;
            username: string;
            storageUsed: string;
        }>;
    };
    files: {
        total: number;
        types: Array<{
            mimeType: string;
            _count: {
                id: number;
            };
        }>;
    };
    logs: {
        recent: Array<{
            id: number;
            operationType: string;
            resourceType: string;
            description: string | null;
            createdAt: string;
            user: {
                username: string;
            };
        }>;
    };
}

export interface AdminUserRow {
    id: number;
    username: string;
    email: string | null;
    role: string;
    status: string;
    storage_quota: number;
    storage_used: number;
    created_at: string;
    session_version: number;
    last_session_kick_at: string | null;
}

export const adminApi = {
    // 获取仪表盘数据
    async getDashboardStats(): Promise<DashboardStats> {
        const res = await request.get<{ success: boolean; data: DashboardStats }>('/admin/dashboard');
        return res.data.data;
    },

    async syncFriendshipsWithAdmin(): Promise<{
        message: string;
        data: { primaryAdminId: number; totalUsers: number; succeeded: number; failures: string[] };
    }> {
        const res = await request.post<{
            success: boolean;
            message: string;
            data: { primaryAdminId: number; totalUsers: number; succeeded: number; failures: string[] };
        }>('/admin/sync-friendships');
        return { message: res.data.message, data: res.data.data };
    },

    async listUsers(): Promise<AdminUserRow[]> {
        const res = await request.get<{ success: boolean; data: AdminUserRow[] }>('/admin/users');
        return res.data.data;
    },

    async updateUserStatus(userId: number, status: 'active' | 'disabled'): Promise<void> {
        await request.patch(`/admin/users/${userId}/status`, { status });
    },

    async resetUserPassword(userId: number): Promise<void> {
        await request.post(`/admin/users/${userId}/reset-password`, {});
    },

    async kickUserSessions(userId: number): Promise<void> {
        await request.post(`/admin/users/${userId}/kick-sessions`, {});
    },

    async clearUserSessionKickMarker(userId: number): Promise<void> {
        await request.post(`/admin/users/${userId}/clear-session-kick-marker`, {});
    }
};
