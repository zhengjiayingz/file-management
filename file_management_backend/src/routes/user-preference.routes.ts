import express from 'express';
import { getUserPreference, updateUserPreference } from '../controllers/user-preference.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * @swagger
 * /api/user-preferences:
 *   get:
 *     summary: 获取当前用户的偏好设置
 *     tags: [用户偏好]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取用户偏好设置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserPreference'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', getUserPreference);

/**
 * @swagger
 * /api/user-preferences:
 *   put:
 *     summary: 更新当前用户的偏好设置
 *     tags: [用户偏好]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               locale:
 *                 type: string
 *                 enum: [auto, zh-CN, zh-TW, en-US]
 *                 description: 语言偏好
 *                 example: zh-CN
 *               theme:
 *                 type: string
 *                 enum: [auto, light, dark]
 *                 description: 主题偏好
 *                 example: dark
 *     responses:
 *       200:
 *         description: 成功更新用户偏好设置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Preferences updated successfully
 *                 preferences:
 *                   $ref: '#/components/schemas/UserPreference'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/', updateUserPreference);

export default router;
