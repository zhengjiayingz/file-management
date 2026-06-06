import express, { Router } from 'express';
import {
  login,
  register,
  getPasswordPolicy,
  getCurrentUser,
  refreshToken,
  logout,
  forgotPasswordRequest,
  changePassword,
  postMySessionsList,
  revokeMySessions,
  verifyMfaLogin,
  mfaSetupStart,
  mfaSetupConfirm,
  mfaSetupCancel,
  mfaDisable
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimiter } from '../middleware/rateLimit.middleware.js';

const router: Router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 用户注册
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: testuser
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 密码
 *                 example: password123
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址（可选）
 *                 example: user@example.com
 *     responses:
 *       201:
 *         description: 注册成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: 用户名已存在
 */
router.post('/register', register);

router.get('/password-policy', getPasswordPolicy);

/**
 * @swagger
 * /api/auth/login:f
 *   post:
 *     summary: 用户登录
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: testuser
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 密码
 *                 example: password123
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   description: JWT 访问令牌
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   description: 刷新令牌
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: 用户名或密码错误
 */
router.post('/login', loginRateLimiter, login);

/** 管理员 TOTP 第二步 */
router.post('/mfa/verify', verifyMfaLogin);

router.post('/forgot-password', forgotPasswordRequest);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: 刷新访问令牌
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: 刷新令牌
 *     responses:
 *       200:
 *         description: 令牌刷新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: 新的 JWT 访问令牌
 *       401:
 *         description: 刷新令牌无效或已过期
 */
router.post('/refresh', refreshToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: 要撤销的刷新令牌
 *     responses:
 *       200:
 *         description: 登出成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logout successful
 */
router.post('/logout', logout);

router.post('/change-password', authenticate, changePassword);

router.post('/mfa/setup/start', authenticate, mfaSetupStart);
router.post('/mfa/setup/confirm', authenticate, mfaSetupConfirm);
router.post('/mfa/setup/cancel', authenticate, mfaSetupCancel);
router.post('/mfa/disable', authenticate, mfaDisable);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取用户信息
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticate, getCurrentUser);

router.post('/sessions/list', authenticate, postMySessionsList);
router.post('/sessions/revoke', authenticate, revokeMySessions);

export default router;
