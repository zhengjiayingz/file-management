import express, { Router } from 'express';
import { getProfile, updateProfile, searchUsers, uploadAvatar } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { avatarUpload } from '../middleware/avatarUpload.middleware.js';

const router: Router = express.Router();

// 所有用户路由都需要认证
router.use(authenticate);

// 获取用户资料
/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: 获取当前用户资料
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取资料
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.get('/profile', getProfile);

// 更新用户资料
/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: 更新用户资料
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.put('/profile', updateProfile);

router.post('/avatar', avatarUpload.single('avatar'), uploadAvatar);

// 搜索用户
/**
 * @swagger
 * /api/user/search:
 *   get:
 *     summary: 搜索用户
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 搜索结果
 */
router.get('/search', searchUsers);

export default router;
