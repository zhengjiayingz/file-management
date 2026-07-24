import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeEmitterService } from '@/realtime/realtime-emitter.service';
import { loadMessageForEmit } from '@/message/message-payload.util';
import {
  LogOperationType,
  LogResourceType,
  OperationLogService,
} from '@/operation-log/operation-log.service';
import type { RequestUser } from '@/auth/types/jwt-payload.type';

@Injectable()
export class VipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly operationLog: OperationLogService,
    private readonly realtime: RealtimeEmitterService,
  ) {}

  async getVipTierComparisonConfig() {
    try {
      const s = await this.passwordPolicy.getSystemSettings();
      return {
        success: true,
        data: {
          storageQuotaUserBytes: s.storageQuotaUserBytes.toString(),
          storageQuotaVipBytes: s.storageQuotaVipBytes.toString(),
          storageQuotaAdminBytes: s.storageQuotaAdminBytes.toString(),
          maxTagsUser: s.maxTagsUser,
          maxTagsVip: s.maxTagsVip,
        },
      };
    } catch {
      throw new InternalServerErrorException('获取会员展示配置失败');
    }
  }

  private async notifyAdminsVipApply(
    applicantId: number,
    username: string,
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', status: 'active' },
      select: { id: true },
    });
    const content = `[VIP升级申请] 用户 ${username}（ID:${applicantId}）申请升级为 VIP。可在本条消息下方直接同意或拒绝，也可在通讯录 → VIP申请 中处理。`;
    for (const a of admins) {
      if (a.id === applicantId) continue;
      const created = await this.prisma.message.create({
        data: {
          senderId: applicantId,
          receiverId: a.id,
          content,
          messageType: 'text',
        },
      });
      const full = await loadMessageForEmit(this.prisma, created.id);
      if (full) {
        this.realtime.emitToUser(a.id, 'message:new', { message: full });
      }
    }
  }

  async applyVipUpgrade(user: RequestUser, req: Request) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!me || me.status !== 'active') {
      throw new BadRequestException('账户状态异常');
    }
    if (me.role === 'admin') {
      throw new BadRequestException('管理员无需申请 VIP');
    }
    if (me.role === 'vip') {
      throw new BadRequestException('您已是 VIP 用户');
    }

    const pending = await this.prisma.vipUpgradeRequest.findFirst({
      where: { applicantId: user.id, status: 'pending' },
    });
    if (pending) {
      throw new BadRequestException(
        '您已有一条待审核的 VIP 申请，请耐心等待',
      );
    }

    await this.prisma.vipUpgradeRequest.create({
      data: { applicantId: user.id, status: 'pending' },
    });

    await this.notifyAdminsVipApply(user.id, me.username);

    try {
      await this.operationLog.logOperation({
        req,
        userId: user.id,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: user.id,
        description: 'Submitted VIP upgrade request',
      });
    } catch (e) {
      console.error('[vip] logOperation', e);
    }

    return {
      success: true,
      message: '申请已提交，管理员将在通讯录中收到通知',
    };
  }

  async listPendingVipRequests() {
    const rows = await this.prisma.vipUpgradeRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: {
        applicant: {
          select: { id: true, username: true, email: true, createdAt: true },
        },
      },
    });

    return {
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        applicantId: r.applicantId,
        username: r.applicant.username,
        email: r.applicant.email,
        createdAt: r.createdAt,
      })),
    };
  }

  async approveVipRequest(adminId: number, requestId: number, req: Request) {
    if (Number.isNaN(requestId)) {
      throw new BadRequestException('无效的 ID');
    }

    const row = await this.prisma.vipUpgradeRequest.findFirst({
      where: { id: requestId, status: 'pending' },
      include: { applicant: true },
    });

    if (!row) {
      throw new NotFoundException('申请不存在或已处理');
    }
    if (row.applicant.role !== 'user') {
      throw new BadRequestException('该用户状态已变更，无法同意');
    }

    const sys = await this.passwordPolicy.getSystemSettings();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.applicantId },
        data: {
          role: 'vip',
          storageQuota: sys.storageQuotaVipBytes,
          vipExpireAt: null,
        },
      }),
      this.prisma.vipUpgradeRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          processedById: adminId,
          processedAt: new Date(),
        },
      }),
    ]);

    try {
      await this.operationLog.logOperation({
        req,
        userId: adminId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: requestId,
        description: `Approved VIP upgrade request #${requestId}`,
      });
    } catch (e) {
      console.error('[vip] log', e);
    }

    return { success: true, message: '已同意该用户的 VIP 升级' };
  }

  async rejectVipRequest(adminId: number, requestId: number) {
    if (Number.isNaN(requestId)) {
      throw new BadRequestException('无效的 ID');
    }

    const updated = await this.prisma.vipUpgradeRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'rejected',
        processedById: adminId,
        processedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('申请不存在或已处理');
    }

    return { success: true, message: '已拒绝该申请' };
  }

  async approveVipByApplicant(adminId: number, applicantId: number, req: Request) {
    if (Number.isNaN(applicantId) || applicantId <= 0) {
      throw new BadRequestException('无效的用户 ID');
    }

    const row = await this.prisma.vipUpgradeRequest.findFirst({
      where: { applicantId, status: 'pending' },
      include: { applicant: true },
    });

    if (!row) {
      throw new NotFoundException('没有待审核的 VIP 申请');
    }
    if (row.applicant.role !== 'user') {
      throw new BadRequestException('该用户状态已变更，无法同意');
    }

    const sys = await this.passwordPolicy.getSystemSettings();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.applicantId },
        data: {
          role: 'vip',
          storageQuota: sys.storageQuotaVipBytes,
          vipExpireAt: null,
        },
      }),
      this.prisma.vipUpgradeRequest.update({
        where: { id: row.id },
        data: {
          status: 'approved',
          processedById: adminId,
          processedAt: new Date(),
        },
      }),
    ]);

    try {
      await this.operationLog.logOperation({
        req,
        userId: adminId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: row.id,
        description: `Approved VIP (by applicantId ${applicantId})`,
      });
    } catch (e) {
      console.error('[vip] log', e);
    }

    return { success: true, message: '已同意该用户的 VIP 升级' };
  }

  async rejectVipByApplicant(adminId: number, applicantId: number) {
    if (Number.isNaN(applicantId) || applicantId <= 0) {
      throw new BadRequestException('无效的用户 ID');
    }

    const row = await this.prisma.vipUpgradeRequest.findFirst({
      where: { applicantId, status: 'pending' },
    });

    if (!row) {
      throw new NotFoundException('没有待审核的 VIP 申请');
    }

    const updated = await this.prisma.vipUpgradeRequest.updateMany({
      where: { id: row.id, status: 'pending' },
      data: {
        status: 'rejected',
        processedById: adminId,
        processedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('申请不存在或已处理');
    }

    return { success: true, message: '已拒绝该申请' };
  }

  async getMyVipRequestStatus(user: RequestUser) {
    const pending = await this.prisma.vipUpgradeRequest.findFirst({
      where: { applicantId: user.id, status: 'pending' },
      select: { id: true, createdAt: true },
    });

    return {
      success: true,
      data: {
        hasPending: !!pending,
        pendingId: pending?.id ?? null,
        role: user.role,
      },
    };
  }
}
