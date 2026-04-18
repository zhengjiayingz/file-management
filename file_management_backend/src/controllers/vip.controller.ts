import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';
import { logOperation, LogOperationType, LogResourceType } from '../services/logger.service.js';

const VIP_QUOTA_BYTES = BigInt(2 * 1024 * 1024 * 1024); // 2GB

async function notifyAdminsVipApply(applicantId: number, username: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'active' },
    select: { id: true }
  });
  const content = `[VIP升级申请] 用户 ${username}（ID:${applicantId}）申请升级为 VIP。可在本条消息下方直接同意或拒绝，也可在通讯录 → VIP申请 中处理。`;
  for (const a of admins) {
    if (a.id === applicantId) continue;
    await prisma.message.create({
      data: {
        senderId: applicantId,
        receiverId: a.id,
        content,
        messageType: 'text'
      }
    });
  }
}

/**
 * 提交 VIP 升级申请（普通用户）
 */
export const applyVipUpgrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const userId = req.user.id;
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, status: true }
    });

    if (!me || me.status !== 'active') {
      res.status(400).json({ success: false, message: '账户状态异常' });
      return;
    }

    if (me.role === 'admin') {
      res.status(400).json({ success: false, message: '管理员无需申请 VIP' });
      return;
    }

    if (me.role === 'vip') {
      res.status(400).json({ success: false, message: '您已是 VIP 用户' });
      return;
    }

    const pending = await prisma.vipUpgradeRequest.findFirst({
      where: { applicantId: userId, status: 'pending' }
    });
    if (pending) {
      res.status(400).json({ success: false, message: '您已有一条待审核的 VIP 申请，请耐心等待' });
      return;
    }

    await prisma.vipUpgradeRequest.create({
      data: { applicantId: userId, status: 'pending' }
    });

    await notifyAdminsVipApply(userId, me.username);

    try {
      await logOperation({
        req,
        userId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: userId,
        description: `Submitted VIP upgrade request`
      });
    } catch (e) {
      console.error('[vip] logOperation', e);
    }

    res.json({
      success: true,
      message: '申请已提交，管理员将在通讯录中收到通知'
    });
  } catch (error) {
    console.error('applyVipUpgrade', error);
    res.status(500).json({ success: false, message: '提交失败' });
  }
};

/**
 * 待审核列表（管理员）
 */
export const listPendingVipRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: '无权访问' });
      return;
    }

    const rows = await prisma.vipUpgradeRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: {
        applicant: {
          select: { id: true, username: true, email: true, createdAt: true }
        }
      }
    });

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        applicantId: r.applicantId,
        username: r.applicant.username,
        email: r.applicant.email,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('listPendingVipRequests', error);
    res.status(500).json({ success: false, message: '获取列表失败' });
  }
};

/**
 * 同意升级（管理员）
 */
export const approveVipRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: '无权操作' });
      return;
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      res.status(400).json({ success: false, message: '无效的 ID' });
      return;
    }

    const adminId = req.user.id;

    const row = await prisma.vipUpgradeRequest.findFirst({
      where: { id: requestId, status: 'pending' },
      include: { applicant: true }
    });

    if (!row) {
      res.status(404).json({ success: false, message: '申请不存在或已处理' });
      return;
    }

    if (row.applicant.role !== 'user') {
      res.status(400).json({ success: false, message: '该用户状态已变更，无法同意' });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.applicantId },
        data: {
          role: 'vip',
          storageQuota: VIP_QUOTA_BYTES,
          vipExpireAt: null
        }
      }),
      prisma.vipUpgradeRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          processedById: adminId,
          processedAt: new Date()
        }
      })
    ]);

    try {
      await logOperation({
        req,
        userId: adminId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: requestId,
        description: `Approved VIP upgrade request #${requestId}`
      });
    } catch (e) {
      console.error('[vip] log', e);
    }

    res.json({ success: true, message: '已同意该用户的 VIP 升级' });
  } catch (error) {
    console.error('approveVipRequest', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/**
 * 拒绝申请（管理员）
 */
export const rejectVipRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: '无权操作' });
      return;
    }

    const requestId = parseInt(req.params.id, 10);
    if (isNaN(requestId)) {
      res.status(400).json({ success: false, message: '无效的 ID' });
      return;
    }

    const adminId = req.user.id;

    const updated = await prisma.vipUpgradeRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'rejected',
        processedById: adminId,
        processedAt: new Date()
      }
    });

    if (updated.count === 0) {
      res.status(404).json({ success: false, message: '申请不存在或已处理' });
      return;
    }

    res.json({ success: true, message: '已拒绝该申请' });
  } catch (error) {
    console.error('rejectVipRequest', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/**
 * 按申请人用户 ID 同意（管理员，用于聊天内快捷操作）
 */
export const approveVipByApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: '无权操作' });
      return;
    }

    const applicantId = parseInt(req.params.applicantId, 10);
    if (isNaN(applicantId) || applicantId <= 0) {
      res.status(400).json({ success: false, message: '无效的用户 ID' });
      return;
    }

    const adminId = req.user.id;

    const row = await prisma.vipUpgradeRequest.findFirst({
      where: { applicantId, status: 'pending' },
      include: { applicant: true }
    });

    if (!row) {
      res.status(404).json({ success: false, message: '没有待审核的 VIP 申请' });
      return;
    }

    if (row.applicant.role !== 'user') {
      res.status(400).json({ success: false, message: '该用户状态已变更，无法同意' });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.applicantId },
        data: {
          role: 'vip',
          storageQuota: VIP_QUOTA_BYTES,
          vipExpireAt: null
        }
      }),
      prisma.vipUpgradeRequest.update({
        where: { id: row.id },
        data: {
          status: 'approved',
          processedById: adminId,
          processedAt: new Date()
        }
      })
    ]);

    try {
      await logOperation({
        req,
        userId: adminId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: row.id,
        description: `Approved VIP (by applicantId ${applicantId})`
      });
    } catch (e) {
      console.error('[vip] log', e);
    }

    res.json({ success: true, message: '已同意该用户的 VIP 升级' });
  } catch (error) {
    console.error('approveVipByApplicant', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/**
 * 按申请人用户 ID 拒绝（管理员）
 */
export const rejectVipByApplicant = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: '无权操作' });
      return;
    }

    const applicantId = parseInt(req.params.applicantId, 10);
    if (isNaN(applicantId) || applicantId <= 0) {
      res.status(400).json({ success: false, message: '无效的用户 ID' });
      return;
    }

    const adminId = req.user.id;

    const row = await prisma.vipUpgradeRequest.findFirst({
      where: { applicantId, status: 'pending' }
    });

    if (!row) {
      res.status(404).json({ success: false, message: '没有待审核的 VIP 申请' });
      return;
    }

    const updated = await prisma.vipUpgradeRequest.updateMany({
      where: { id: row.id, status: 'pending' },
      data: {
        status: 'rejected',
        processedById: adminId,
        processedAt: new Date()
      }
    });

    if (updated.count === 0) {
      res.status(404).json({ success: false, message: '申请不存在或已处理' });
      return;
    }

    res.json({ success: true, message: '已拒绝该申请' });
  } catch (error) {
    console.error('rejectVipByApplicant', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/**
 * 当前用户 VIP 申请状态（是否待审核）
 */
export const getMyVipRequestStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const pending = await prisma.vipUpgradeRequest.findFirst({
      where: { applicantId: req.user.id, status: 'pending' },
      select: { id: true, createdAt: true }
    });

    res.json({
      success: true,
      data: {
        hasPending: !!pending,
        pendingId: pending?.id ?? null,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('getMyVipRequestStatus', error);
    res.status(500).json({ success: false, message: '获取状态失败' });
  }
};
