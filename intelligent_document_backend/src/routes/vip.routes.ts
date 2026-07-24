import { Router,type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  applyVipUpgrade,
  listPendingVipRequests,
  approveVipRequest,
  rejectVipRequest,
  approveVipByApplicant,
  rejectVipByApplicant,
  getMyVipRequestStatus,
  getVipTierComparisonConfig
} from '../controllers/vip.controller.js';

const router: RouterType = Router();

router.get('/tier-config', authenticate, getVipTierComparisonConfig);

router.use(authenticate);

router.post('/apply', applyVipUpgrade);
router.get('/pending', listPendingVipRequests);
router.get('/my-status', getMyVipRequestStatus);
router.post('/applicant/:applicantId/approve', approveVipByApplicant);
router.post('/applicant/:applicantId/reject', rejectVipByApplicant);
router.post('/requests/:id/approve', approveVipRequest);
router.post('/requests/:id/reject', rejectVipRequest);

export default router;
