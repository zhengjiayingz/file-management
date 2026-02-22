import request from '../utils/request';

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

export const adminApi = {
    // 获取仪表盘数据
    async getDashboardStats(): Promise<DashboardStats> {
        const res = await request.get<{ success: boolean; data: DashboardStats }>('/admin/dashboard');
        return res.data.data;
    }
};
