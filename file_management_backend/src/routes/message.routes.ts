import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
    sendMessage,
    getChatHistory,
    markAsRead,
    getUnreadSummary
} from '../controllers/message.controller.js';

const router: Router = express.Router();

router.use(authenticate);

// 获取所有好友的发给我的未读消息总数（按发件人分组）
router.get('/unread-summary', getUnreadSummary);

// 发送文本/文件消息
router.post('/', sendMessage);

// 获取与某个好友的聊天历史
router.get('/:friendId', getChatHistory);

// 将与某个好友的未读消息设置为已读
router.put('/:friendId/read', markAsRead);

export default router;
