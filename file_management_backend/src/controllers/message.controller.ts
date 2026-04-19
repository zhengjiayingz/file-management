import { Response } from 'express';
import { PrismaClient, MessageType, FriendshipStatus } from '@prisma/client';
import { AuthRequest } from '../types/index.js';
import { emitToUser } from '../realtime/socket.js';
import { loadMessageForEmit } from '../realtime/messagePayload.js';

const prisma = new PrismaClient();

// 发送消息
export const sendMessage = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const senderId = req.user?.id;
        const { receiverId, content, messageType = MessageType.text, fileId } = req.body;

        if (!senderId) {
            return res.status(401).json({ message: '未授权' });
        }

        if (!receiverId || !content) {
            return res.status(400).json({ message: '接收者ID和消息内容不能为空' });
        }

        // 检查是否是好友
        const friendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { userId: senderId, friendId: receiverId, status: FriendshipStatus.accepted },
                    { userId: receiverId, friendId: senderId, status: FriendshipStatus.accepted },
                ],
            },
        });

        if (!friendship) {
            return res.status(403).json({ message: '只有好友之间才能发送消息' });
        }

        const message = await prisma.message.create({
            data: {
                senderId,
                receiverId,
                content,
                messageType,
                fileId: fileId ? parseInt(fileId) : null,
            },
        });

        const full = await loadMessageForEmit(message.id);
        if (full) {
            emitToUser(receiverId, 'message:new', { message: full });
        }

        return res.status(201).json({
            message: '消息发送成功',
            data: message,
        });
    } catch (error: any) {
        console.error('发送消息失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 获取与某个好友的聊天记录
export const getChatHistory = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { friendId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const parsedFriendId = parseInt(friendId);

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: parsedFriendId },
                    { senderId: parsedFriendId, receiverId: userId },
                ],
            },
            include: {
                file: {
                    select: { id: true, fileName: true, fileType: true },
                },
            },
            orderBy: { createdAt: 'asc' }, // 升序，最老的在最上面
        });

        return res.json(messages);
    } catch (error: any) {
        console.error('获取聊天记录失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 标记消息为已读
export const markAsRead = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;
        const { friendId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        // 更新此好友发给我、且我尚未读取的所有消息
        const updated = await prisma.message.updateMany({
            where: {
                senderId: parseInt(friendId),
                receiverId: userId,
                isRead: false,
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });

        return res.json({ message: '消息已标记为已读', updatedCount: updated.count });
    } catch (error: any) {
        console.error('标记已读失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};

// 获取未读消息汇总列表（按好友分组）
export const getUnreadSummary = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }

        const unreadMessages = await prisma.message.groupBy({
            by: ['senderId'],
            where: {
                receiverId: userId,
                isRead: false,
            },
            _count: {
                id: true,
            },
            _max: {
                createdAt: true,
            },
        });

        return res.json(unreadMessages);
    } catch (error: any) {
        console.error('获取未读汇总失败:', error);
        return res.status(500).json({ message: '服务器内部错误' });
    }
};
