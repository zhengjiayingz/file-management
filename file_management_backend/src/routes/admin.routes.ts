import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { getDashboardStats } from '../controllers/admin.controller.js';

const router: Router = Router();

// 所有路由都需要管理员权限
router.use(authenticate, requireAdmin);

router.get('/dashboard', getDashboardStats);

export default router;
