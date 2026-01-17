import express, { Router } from 'express';
import { login, register, getCurrentUser, refreshToken, logout } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router: Router = express.Router();

// 注册
router.post('/register', register);

// 登录
router.post('/login', login);

// 刷新 Token
router.post('/refresh', refreshToken);

// 登出
router.post('/logout', logout);

// 获取当前用户信息
router.get('/me', authenticate, getCurrentUser);

export default router;
