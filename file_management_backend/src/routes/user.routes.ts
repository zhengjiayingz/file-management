import express from 'express';
import { getProfile, updateProfile } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// 所有用户路由都需要认证
router.use(authenticate);

// 获取用户资料
router.get('/profile', getProfile);

// 更新用户资料
router.put('/profile', updateProfile);

export default router;
