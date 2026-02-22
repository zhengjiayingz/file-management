import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    getFriendsList,
    getPendingRequests,
    removeFriend
} from '../controllers/friendship.controller.js';

const router: Router = express.Router();

router.use(authenticate);

// 获取好友列表
router.get('/', getFriendsList);

// 获取待处理的好友请求列表
router.get('/requests/pending', getPendingRequests);

// 发送好友请求
router.post('/request', sendFriendRequest);

// 接受好友申请
router.put('/request/:requestId/accept', acceptFriendRequest);

// 拒绝好友申请
router.put('/request/:requestId/reject', rejectFriendRequest);

// 删除好友
router.delete('/:friendId', removeFriend);

export default router;
