import express, { Router } from 'express';
import {
  createShare,
  getPublicShareMeta,
  accessPublicShare,
  downloadSharedFile
} from '../controllers/share.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router: Router = express.Router();

router.get('/public/:shareCode', getPublicShareMeta);
router.post('/public/:shareCode/access', accessPublicShare);
router.get('/public/:shareCode/file/:userFileId/download', downloadSharedFile);

router.post('/', authenticate, createShare);

export default router;
