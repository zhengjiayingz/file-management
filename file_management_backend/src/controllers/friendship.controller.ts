import { Response } from 'express';
import { PrismaClient, FriendshipStatus } from '@prisma/client';
import { AuthRequest } from '../types/index.js';

const prisma = new PrismaClient();

// 发送好友请求
export const sendFriendRequest = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { friendUsername, friendId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        if (!friendUsername && !friendId) {
            return res.status(400).json({ message: '请输入好友用户名或ID' });
        }

        let friend = null;
        if (friendId) {
            friend = await prisma.user.findUnique({ where: { id: parseInt(friendId) } });
        } else {
            friend = await prisma.user.findUnique({ where: { username: friendUsername } });
        }

        if (!friend) {
            return res.status(404).json({ message: '用户不存在' });
        }

        if (friend.id === userId) {
            return res.status(400).json({ message: '不能添加自己为好友' });
        }

        // 检查是否已经是好友或已发送请求
        const existingFriendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { userId, friendId: friend.id },
                    { userId: friend.id, friendId: userId },
                ],
            },
        });

        if (existingFriendship) {
            if (existingFriendship.status === FriendshipStatus.pending) {
                return res.status(400).json({ message: '已发送好友请求，请等待对方处理' });
            }
            if (existingFriendship.status === FriendshipStatus.accepted) {
                return res.status(400).json({ message: '你们已经是好友了' });
            }
            if (existingFriendship.status === FriendshipStatus.blocked) {
                return res.status(400).json({ message: '无法添加好友' });
            }
        }

        // 创建好友请求
        const friendship = await prisma.friendship.create({
            data: {
                userId,
                friendId: friend.id,
                status: FriendshipStatus.pending,
            },
        });

        return res.status(201).json({
            message: '好友请求发送成功',
            friendship,
        });
    } catch (error: any) {
        console.error('发送好友请求失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 接受好友请求
export const acceptFriendRequest = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { requestId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const friendship = await prisma.friendship.findUnique({
            where: { id: parseInt(requestId) },
        });

        if (!friendship) {
            return res.status(404).json({ message: '请求不存在' });
        }

        // 只能接受发给自己的请求
        if (friendship.friendId !== userId) {
            return res.status(403).json({ message: '无权操作此请求' });
        }

        if (friendship.status !== FriendshipStatus.pending) {
            return res.status(400).json({ message: '该请求已处理' });
        }

        // 更新状态为已接受
        const updatedFriendship = await prisma.friendship.update({
            where: { id: friendship.id },
            data: { status: FriendshipStatus.accepted },
        });

        return res.json({
            message: '已接受好友申请',
            friendship: updatedFriendship,
        });
    } catch (error: any) {
        console.error('接受好友请求失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 拒绝好友请求
export const rejectFriendRequest = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { requestId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const friendship = await prisma.friendship.findUnique({
            where: { id: parseInt(requestId) },
        });

        if (!friendship) {
            return res.status(404).json({ message: '请求不存在' });
        }

        if (friendship.friendId !== userId) {
            return res.status(403).json({ message: '无权操作此请求' });
        }

        if (friendship.status !== FriendshipStatus.pending) {
            return res.status(400).json({ message: '该请求已处理' });
        }

        // 更新状态为已拒绝
        const updatedFriendship = await prisma.friendship.update({
            where: { id: friendship.id },
            data: { status: FriendshipStatus.rejected },
        });

        return res.json({
            message: '已拒绝好友申请',
            friendship: updatedFriendship,
        });
    } catch (error: any) {
        console.error('拒绝好友请求失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 获取好友列表
export const getFriendsList = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const friendships = await prisma.friendship.findMany({
            where: {
                OR: [
                    { userId, status: FriendshipStatus.accepted },
                    { friendId: userId, status: FriendshipStatus.accepted },
                ],
            },
            include: {
                user: {
                    select: { id: true, username: true, email: true },
                },
                friend: {
                    select: { id: true, username: true, email: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // 格式化输出，提取出真正的好友信息
        const friendMap = new Map();

        friendships.forEach((f) => {
            const isSender = f.userId === userId;
            const friendInfo = isSender ? f.friend : f.user;

            // 使用 friendId 作为 Key 进行去重，防止同一对好友出现多条记录（如互相申请）
            if (!friendMap.has(friendInfo.id)) {
                friendMap.set(friendInfo.id, {
                    friendshipId: f.id,
                    friendId: friendInfo.id,
                    username: friendInfo.username,
                    email: friendInfo.email,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt
                });
            }
        });

        const formattedFriends = Array.from(friendMap.values());

        return res.json(formattedFriends);
    } catch (error: any) {
        console.error('获取好友列表失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 获取待处理的好友请求列表
export const getPendingRequests = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const requests = await prisma.friendship.findMany({
            where: {
                friendId: userId,
                status: FriendshipStatus.pending,
            },
            include: {
                user: {
                    select: { id: true, username: true, email: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formattedRequests = requests.map((r) => ({
            requestId: r.id,
            senderId: r.user.id,
            senderUsername: r.user.username,
            createdAt: r.createdAt,
        }));

        return res.json(formattedRequests);
    } catch (error: any) {
        console.error('获取待处理请求失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 删除好友
export const removeFriend = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { friendId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const parsedFriendId = parseInt(friendId);

        const friendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { userId, friendId: parsedFriendId, status: FriendshipStatus.accepted },
                    { userId: parsedFriendId, friendId: userId, status: FriendshipStatus.accepted },
                ],
            },
        });

        if (!friendship) {
            return res.status(404).json({ message: '好友关系不存在' });
        }

        await prisma.friendship.delete({
            where: { id: friendship.id },
        });

        return res.json({ message: '已删除好友' });
    } catch (error: any) {
        console.error('删除好友失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};
