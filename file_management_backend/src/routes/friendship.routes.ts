import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    getFriendsList,
    getPendingRequests,
    removeFriend
} from '../controllers/friendship.controller.js';

const router: Router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: 好友管理
 *   description: 用户好友关系、请求及消息管理
 */

// 获取好友列表
/**
 * @swagger
 * /api/friendships:
 *   get:
 *     summary: 获取当前用户的好友列表
 *     tags: [好友管理]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取好友列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   friendshipId:
 *                     type: integer
 *                   friendId:
 *                     type: integer
 *                   username:
 *                     type: string
 *                   email:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/', getFriendsList);

// 获取待处理的好友请求列表
/**
 * @swagger
 * /api/friendships/requests/pending:
 *   get:
 *     summary: 获取待处理的好友申请列表
 *     tags: [好友管理]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取待处理请求
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   requestId:
 *                     type: integer
 *                   senderId:
 *                     type: integer
 *                   senderUsername:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/requests/pending', getPendingRequests);

// 发送好友请求
/**
 * @swagger
 * /api/friendships/request:
 *   post:
 *     summary: 发送好友申请
 *     tags: [好友管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               friendUsername:
 *                 type: string
 *                 description: 好友用户名（与 friendId 二选一）
 *               friendId:
 *                 type: string
 *                 description: 好友用户ID（与 friendUsername 二选一）
 *     responses:
 *       201:
 *         description: 申请发送成功
 *       400:
 *         description: 参数错误或已是好友/申请中
 */
router.post('/request', sendFriendRequest);

// 接受好友申请
/**
 * @swagger
 * /api/friendships/request/{requestId}/accept:
 *   put:
 *     summary: 接受好友申请
 *     tags: [好友管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 已接受好友申请
 */
router.put('/request/:requestId/accept', acceptFriendRequest);

// 拒绝好友申请
/**
 * @swagger
 * /api/friendships/request/{requestId}/reject:
 *   put:
 *     summary: 拒绝好友申请
 *     tags: [好友管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 已拒绝好友申请
 */
router.put('/request/:requestId/reject', rejectFriendRequest);

// 删除好友
/**
 * @swagger
 * /api/friendships/{friendId}:
 *   delete:
 *     summary: 删除好友
 *     tags: [好友管理]
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
 *         description: 好友已删除
 */
router.delete('/:friendId', removeFriend);

export default router;
