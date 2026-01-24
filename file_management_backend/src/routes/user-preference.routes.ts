import express from 'express';
import { getUserPreference, updateUserPreference } from '../controllers/user-preference.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

// 获取用户配置
router.get('/', getUserPreference);

// 更新用户配置
router.put('/', updateUserPreference);

export default router;
