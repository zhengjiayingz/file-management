import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

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
