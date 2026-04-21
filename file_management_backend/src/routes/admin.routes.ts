import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import {
    getDashboardStats,
    syncFriendshipsWithAdmin,
    listUsers,
    updateUserStatus,
    resetUserPassword,
    kickUserSessions,
    clearUserSessionKickMarker,
    getAdminSystemSettings,
    updateAdminSystemSettings
} from '../controllers/admin.controller.js';

const router: Router = Router();

// 所有路由都需要管理员权限
router.use(authenticate, requireAdmin);

router.get('/dashboard', getDashboardStats);

router.get('/system-settings', getAdminSystemSettings);
router.put('/system-settings', updateAdminSystemSettings);

router.post('/sync-friendships', syncFriendshipsWithAdmin);

router.get('/users', listUsers);
router.patch('/users/:id/status', updateUserStatus);
router.post('/users/:id/reset-password', resetUserPassword);
router.post('/users/:id/kick-sessions', kickUserSessions);
router.post('/users/:id/clear-session-kick-marker', clearUserSessionKickMarker);

export default router;
