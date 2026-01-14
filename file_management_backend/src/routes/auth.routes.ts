import express from 'express';
import { login, register, getCurrentUser } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// 登录
router.post('/login', login);

// 注册
router.post('/register', register);

// 获取当前用户信息
router.get('/me', authenticate, getCurrentUser);

export default router;
