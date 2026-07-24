
import express, { Router } from 'express';
import { getOperationLogs } from '../controllers/log.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router: Router = express.Router();

// 所有日志路由都需要认证
router.use(authenticate);

// 获取日志列表（自动根据角色过滤）
/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: 获取系统操作日志
 *     tags: [系统日志]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: 操作类型筛选
 *     responses:
 *       200:
 *         description: 成功获取日志列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/', getOperationLogs);

export default router;
