import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';
import { ensureFriendshipWithAdmin, getPrimaryAdminId } from '../services/adminFriend.service.js';
import { hashPassword, ADMIN_TEMP_RESET_PASSWORD } from '../services/passwordPolicy.service.js';

export const getDashboardStats = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        // 1. 用户统计
        const totalUsers = await prisma.user.count();
        const activeUsers = await prisma.user.count({ where: { status: 'active' } });
        const userRoles = await prisma.user.groupBy({
            by: ['role'],
            _count: {
                id: true
            }
        });

        const roleDistribution = userRoles.reduce((acc, curr) => {
            acc[curr.role] = curr._count.id;
            return acc;
        }, {} as Record<string, number>);

        // 2. 存储统计
        const totalStorageQuery = await prisma.fileStorage.aggregate({
            _sum: {
                fileSize: true
            }
        });
        // BigInt 转 string 防止 JSON 序列化问题
        const totalStorageUsed = totalStorageQuery._sum.fileSize?.toString() || '0';

        // 用户存储排行 (Top 5)
        const storageRanking = await prisma.user.findMany({
            orderBy: {
                storageUsed: 'desc'
            },
            take: 5,
            select: {
                id: true,
                username: true,
                storageUsed: true
            }
        });

        // 格式化 BigInt
        const formattedStorageRanking = storageRanking.map(user => ({
            ...user,
            storageUsed: user.storageUsed.toString()
        }));

        // 3. 文件统计
        const totalFiles = await prisma.userFile.count({ where: { isDeleted: false, fileType: 'file' } });
        const fileTypeDistribution = await prisma.fileStorage.groupBy({
            by: ['mimeType'],
            _count: {
                id: true
            },
            orderBy: {
                _count: {
                    id: 'desc'
                }
            },
            take: 10 // 只取前10种类型
        });

        // 4. 操作日志 (最近7天)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 按天统计操作数量
        // 注意：Prisma groupBy 对日期支持有限，通常需要 raw query 或者在应用层处理
        // 这里为了简化，我们先取简单的总数，或者改用 distinct count

        // 简单起见，我们仅返回最近的操作日志列表供前端展示趋势，或者只统计总量
        // 更好的方式是用 raw query 按天截断，这里先用 total count 替代
        // 或者查询过去7天的所有必要日志，在内存中处理（如果数据量不大）

        // 暂时获取最近50条操作日志展示
        const recentOperations = await prisma.operationLog.findMany({
            take: 20,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                user: {
                    select: {
                        username: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    roles: roleDistribution
                },
                storage: {
                    totalUsed: totalStorageUsed,
                    ranking: formattedStorageRanking
                },
                files: {
                    total: totalFiles,
                    types: fileTypeDistribution
                },
                logs: {
                    recent: recentOperations
                }
            }
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: '获取仪表盘数据失败'
        });
    }
};

/**
 * 为所有非管理员用户与主管理员（id 最小的 admin）补全 accepted 好友关系（与 npm run backfill-friends 一致）
 */
export const syncFriendshipsWithAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const adminId = await getPrimaryAdminId();
        if (!adminId) {
            res.status(500).json({ success: false, message: '系统中没有管理员账号' });
            return;
        }

        const users = await prisma.user.findMany({
            where: {
                NOT: { id: adminId },
                role: { not: 'admin' }
            },
            select: { id: true, username: true }
        });

        let succeeded = 0;
        const failures: string[] = [];

        for (const u of users) {
            try {
                await ensureFriendshipWithAdmin(u.id);
                succeeded++;
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                failures.push(`${u.username}(${u.id}): ${msg}`);
            }
        }

        res.json({
            success: true,
            message: `已为 ${succeeded} 个用户与主管理员（ID:${adminId}）补全好友关系`,
            data: {
                primaryAdminId: adminId,
                totalUsers: users.length,
                succeeded,
                failures: failures.slice(0, 30)
            }
        });
    } catch (error) {
        console.error('syncFriendshipsWithAdmin error:', error);
        res.status(500).json({ success: false, message: '同步好友关系失败' });
    }
};

export const listUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { id: 'asc' },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                status: true,
                storageQuota: true,
                storageUsed: true,
                createdAt: true
            }
        });

        res.json({
            success: true,
            data: users.map((u) => ({
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
                status: u.status,
                storage_quota: Number(u.storageQuota),
                storage_used: Number(u.storageUsed),
                created_at: u.createdAt
            }))
        });
    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
};

export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body as { status?: string };

        if (Number.isNaN(id)) {
            res.status(400).json({ success: false, message: '无效的用户 ID' });
            return;
        }

        if (status !== 'active' && status !== 'disabled') {
            res.status(400).json({ success: false, message: '状态必须为 active 或 disabled' });
            return;
        }

        if (!req.user) {
            res.status(401).json({ success: false, message: '未认证' });
            return;
        }

        if (id === req.user.id) {
            res.status(400).json({ success: false, message: '不能禁用自己的账号' });
            return;
        }

        const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
        if (!target) {
            res.status(404).json({ success: false, message: '用户不存在' });
            return;
        }

        if (target.role === 'admin' && status === 'disabled') {
            res.status(400).json({ success: false, message: '不能禁用管理员账号' });
            return;
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: { status: status as 'active' | 'disabled' }
            });
            if (status === 'disabled') {
                await tx.refreshToken.updateMany({
                    where: { userId: id },
                    data: { isRevoked: true }
                });
            }
        });

        res.json({ success: true, message: '用户状态已更新' });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ success: false, message: '更新用户状态失败' });
    }
};

export const resetUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);

        if (Number.isNaN(id)) {
            res.status(400).json({ success: false, message: '无效的用户 ID' });
            return;
        }

        const target = await prisma.user.findUnique({ where: { id } });
        if (!target) {
            res.status(404).json({ success: false, message: '用户不存在' });
            return;
        }

        /** 统一临时密码（不符合强度策略）；用户登录后须自行修改为强密码 */
        const hashed = hashPassword(ADMIN_TEMP_RESET_PASSWORD);

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id },
                data: { password: hashed, mustChangePassword: true },
            });
            await tx.refreshToken.updateMany({
                where: { userId: id },
                data: { isRevoked: true }
            });
        });

        res.json({
            success: true,
            message: '密码已重置。请用户使用统一临时密码登录，登录后须立即修改为符合策略的新密码。',
        });
    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({ success: false, message: '重置密码失败' });
    }
};
