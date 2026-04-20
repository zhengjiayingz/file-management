import express, { Router } from 'express';
import {
  createShare,
  getPublicShareMeta,
  accessPublicShare,
  downloadSharedFile,
  listMyShares,
  getShareAccessLogs
} from '../controllers/share.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router: Router = express.Router();

router.get('/mine', authenticate, listMyShares);
router.get('/public/:shareCode', getPublicShareMeta);
router.post('/public/:shareCode/access', accessPublicShare);
router.get('/public/:shareCode/file/:userFileId/download', downloadSharedFile);
router.get('/:shareId/access-logs', authenticate, getShareAccessLogs);

router.post('/', authenticate, createShare);

export default router;
