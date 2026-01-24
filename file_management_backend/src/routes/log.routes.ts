
import express from 'express';
import { getOperationLogs } from '../controllers/log.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// 所有日志路由都需要认证
router.use(authenticate);

// 获取日志列表（自动根据角色过滤）
router.get('/', getOperationLogs);

export default router;
