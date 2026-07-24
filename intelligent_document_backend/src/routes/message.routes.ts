import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
    sendMessage,
    getChatHistory,
    markAsRead,
    getUnreadSummary
} from '../controllers/message.controller.js';

const router: Router = express.Router();

// 所有接口先过 authenticate（JWT）
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: 消息与分享
 *   description: 好友间的即时消息与文件分享
 */

// 获取所有好友的发给我的未读消息总数（按发件人分组）
/**
 * @swagger
 * /api/messages/unread-summary:
 *   get:
 *     summary: 获取未读消息汇总
 *     tags: [消息与分享]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取未读消息统计
 */
router.get('/unread-summary', getUnreadSummary);

// 发送文本/文件消息
/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: 发送消息或分享文件
 *     description: 支持发送普通文本消息或分享特定文件给好友
 *     tags: [消息与分享]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [receiverId, content]
 *             properties:
 *               receiverId:
 *                 type: integer
 *                 description: 接收者用户ID
 *               content:
 *                 type: string
 *                 description: 消息内容（如果是分享文件，通常描述文件内容）
 *               messageType:
 *                 type: string
 *                 enum: [text, file]
 *                 default: text
 *               fileId:
 *                 type: integer
 *                 description: 分享的文件ID（当 messageType 为 file 时必填）
 *     responses:
 *       201:
 *         description: 消息/分享发送成功
 *       403:
 *         description: 非好友关系无法发送
 */
router.post('/', sendMessage);

// 获取与某个好友的聊天历史
/**
 * @swagger
 * /api/messages/{friendId}:
 *   get:
 *     summary: 获取聊天记录
 *     tags: [消息与分享]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 成功获取聊天记录
 */
router.get('/:friendId', getChatHistory);

// 将与某个好友的未读消息设置为已读
/**
 * @swagger
 * /api/messages/{friendId}/read:
 *   put:
 *     summary: 标记消息为已读
 *     tags: [消息与分享]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 消息已标记为已读
 */
router.put('/:friendId/read', markAsRead);

export default router;
