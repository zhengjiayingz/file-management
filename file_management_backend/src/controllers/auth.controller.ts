import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verifySync } from 'otplib';
import dotenv from 'dotenv';
import { Prisma, type Role, type User, type Status } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { AuthRequest, LoginBody, RegisterBody } from '../types/index.js';
import { ensureFriendshipWithAdmin, getPrimaryAdminId } from '../services/adminFriend.service.js';
import { emitToUser } from '../realtime/socket.js';
import { loadMessageForEmit } from '../realtime/messagePayload.js';
import {
  hashPassword,
  validatePasswordStrengthWithPolicy,
  settingsRowToPolicy,
  describePasswordPolicy,
  policyToPublicDTO
} from '../services/passwordPolicy.service.js';
import { getSystemSettings } from '../services/systemSettings.service.js';

// 确保环境变量被加载
dotenv.config();

/**
 * 与 `schema.prisma` 中 `users` 表 TOTP 列一致。若已 `prisma generate`，`User` 已含这些字段；交叉类型在「生成物/IDE 未刷新」时仍可安全读写运行时属性。
 * `assert*`：在 Stale 的 `UserUpdateInput`/`UserSelect` 不含 `totp_*` 时通过编译（以 schema 为权威）。
 */
type UserWithTotp = User & {
  totpEnabled: boolean;
  totpSecret: string | null;
  totpSetupSecret: string | null;
};

const userUpdateData = (d: Record<string, unknown>): Prisma.UserUpdateInput =>
  d as unknown as Prisma.UserUpdateInput;

/**
 * 生成 Access Token (15分钟)
 */
const generateAccessToken = (
  userId: number,
  username: string,
  mustChangePassword: boolean,
  sessionVersion: number
): string => {
  return jwt.sign(
    { id: userId, username, mustChangePassword, sv: sessionVersion },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );
};

/**
 * 生成 Refresh Token (7天)
 */
const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

const MFA_LOGIN_JWT_TYP = 'mfa_login';

type MfaLoginJwtPayload = {
  typ: typeof MFA_LOGIN_JWT_TYP;
  uid: number;
  /** 密码校验通过时是否须改密（与 policy 合算后） */
  fc: 0 | 1;
  /** 是否因当前密码不符合策略而须改密 */
  pc: 0 | 1;
};

function signMfaLoginToken(p: { uid: number; finalMustChange: boolean; needPolicyChange: boolean }): string {
  const body: MfaLoginJwtPayload = {
    typ: MFA_LOGIN_JWT_TYP,
    uid: p.uid,
    fc: p.finalMustChange ? 1 : 0,
    pc: p.needPolicyChange ? 1 : 0
  };
  return jwt.sign(body, process.env.JWT_SECRET!, { expiresIn: '5m' });
}

function parseMfaLoginToken(token: string): MfaLoginJwtPayload | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as MfaLoginJwtPayload;
    if (decoded?.typ !== MFA_LOGIN_JWT_TYP || typeof decoded.uid !== 'number') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * 完成登录态：发 refresh、写成功登录日志。供密码登录与 TOTP 第二步共用。
 */
async function runLoginSessionTransaction(
  req: AuthRequest,
  user: { id: number; username: string; role: Role },
  finalMustChange: boolean,
  revokeId: number | undefined
): Promise<{ accessToken: string; refreshToken: string }> {
  const limit = getMaxSessionSlots(user.role);

  return prisma.$transaction(
    async (tx) => {
      if (revokeId != null) {
        const revoked = await tx.refreshToken.updateMany({
          where: { id: revokeId, userId: user.id, isRevoked: false },
          data: { isRevoked: true }
        });
        if (revoked.count === 0) {
          throw new InvalidRevokeSessionError();
        }
      }

      const activeWhere = {
        userId: user.id,
        isRevoked: false,
        expiresAt: { gt: new Date() }
      };
      const activeCount = await tx.refreshToken.count({ where: activeWhere });

      if (limit !== null && activeCount >= limit) {
        throw new SessionLimitError(user.id, user.role);
      }

      const uAfter = await tx.user.update({
        where: { id: user.id },
        data: {
          lastSessionKickAt: null,
          mustChangePassword: finalMustChange,
          ...(revokeId != null ? { sessionVersion: { increment: 1 } } : {})
        },
        select: { sessionVersion: true }
      });

      const accessToken = generateAccessToken(
        user.id,
        user.username,
        finalMustChange,
        uAfter.sessionVersion
      );
      const refreshToken = generateRefreshToken();

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          deviceType: 'web',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      await tx.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'success'
        }
      });

      return { accessToken, refreshToken };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000
    }
  );
}

/** 管理员不限制；VIP 5；普通用户 2 */
function getMaxSessionSlots(role: Role): number | null {
  if (role === 'admin') return null;
  if (role === 'vip') return 5;
  return 2;
}

async function listActiveSessionsForResponse(userId: number) {
  const rows = await prisma.refreshToken.findMany({
    where: {
      userId,
      isRevoked: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      deviceName: true,
      deviceType: true,
      createdAt: true,
      lastUsedAt: true
    }
  });
  return rows.map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    deviceName: r.deviceName,
    deviceType: r.deviceType,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null
  }));
}

/** 事务内抛出的会话上限（回滚后由外层查询列表再返回 409） */
class SessionLimitError extends Error {
  constructor(
    public readonly uid: number,
    public readonly role: Role
  ) {
    super('SESSION_LIMIT');
    this.name = 'SessionLimitError';
  }
}

class InvalidRevokeSessionError extends Error {
  constructor() {
    super('INVALID_REVOKE_SESSION');
    this.name = 'InvalidRevokeSessionError';
  }
}

/** 公开：当前系统密码强度策略（注册 / 改密表单客户端提示用） */
export const getPasswordPolicy = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await getSystemSettings();
    const policy = settingsRowToPolicy(settings);
    res.json({ success: true, data: policyToPublicDTO(policy) });
  } catch (error) {
    console.error('getPasswordPolicy error:', error);
    res.status(500).json({ success: false, message: '获取密码策略失败' });
  }
};

/**
 * 用户注册
 */
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password, email } = req.body as RegisterBody;

    // 验证输入
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: '请提供用户名和密码'
      });
      return;
    }

    // 验证用户名长度
    if (username.length < 3 || username.length > 50) {
      res.status(400).json({
        success: false,
        message: '用户名长度必须在3-50个字符之间'
      });
      return;
    }

    const settings = await getSystemSettings();
    const regPolicy = settingsRowToPolicy(settings);
    const strengthErr = validatePasswordStrengthWithPolicy(password, regPolicy);
    if (strengthErr) {
      res.status(400).json({
        success: false,
        message: strengthErr
      });
      return;
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUser) {
      res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
      return;
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingEmail) {
        res.status(400).json({
          success: false,
          message: '邮箱已被注册'
        });
        return;
      }
    }

    // 加密密码
    const hashedPassword = hashPassword(password);

    // 使用事务创建用户和相关记录
    const result = await prisma.$transaction(async (tx) => {
      // 创建新用户
      const newUser = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          email: email || null,
          role: 'user',
          storageQuota: settings.storageQuotaUserBytes,
          storageUsed: BigInt(0),
          status: 'active'
        }
      });

      // 生成tokens
      const accessToken = generateAccessToken(newUser.id, newUser.username, false, newUser.sessionVersion);
      const refreshToken = generateRefreshToken();

      // 存储 Refresh Token
      await tx.refreshToken.create({
        data: {
          userId: newUser.id,
          token: refreshToken,
          deviceType: 'web',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
        }
      });

      // 记录登录日志
      await tx.loginLog.create({
        data: {
          userId: newUser.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'success'
        }
      });

      return { newUser, accessToken, refreshToken };
    });

    try {
      await ensureFriendshipWithAdmin(result.newUser.id);
    } catch (e) {
      console.error('Register: ensureFriendshipWithAdmin failed:', e);
    }

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: result.newUser.id,
          username: result.newUser.username,
          email: result.newUser.email,
          role: result.newUser.role,
          storage_quota: Number(result.newUser.storageQuota),
          storage_used: Number(result.newUser.storageUsed),
          must_change_password: false,
          avatar_url: result.newUser.avatarUrl ?? null,
          vip_expire_at: result.newUser.vipExpireAt ? result.newUser.vipExpireAt.toISOString() : null,
          created_at: result.newUser.createdAt.toISOString(),
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试'
    });
  }
};

/**
 * 用户登录
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as LoginBody;

    // 验证输入
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: '请提供用户名和密码'
      });
      return;
    }

    const user = (await prisma.user.findUnique({
      where: { username },
    })) as UserWithTotp | null;
    
    if (!user) {
      // 记录失败的登录尝试
      await prisma.loginLog.create({
        data: {
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '用户不存在'
        }
      });
      
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    // 检查账户状态（在验证密码之前，避免泄露账号是否存在的额外信息）
    if (user.status !== 'active') {
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '账户已被禁用'
        }
      });

      res.status(403).json({
        success: false,
        message: '账号处在封禁状态，请联系管理员'
      });
      return;
    }

    // 验证密码
    const hashedPassword = hashPassword(password);
    
    if (hashedPassword !== user.password) {
      // 记录失败的登录尝试
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '密码错误'
        }
      });
      
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    const settings = await getSystemSettings();
    const policy = settingsRowToPolicy(settings);
    const needPolicyChange = validatePasswordStrengthWithPolicy(password, policy) !== null;
    const finalMustChange = user.mustChangePassword || needPolicyChange;

    const mfaRequired =
      user.totpEnabled === true && Boolean(user.totpSecret && user.totpSecret.length > 0);
    if (mfaRequired) {
      const mfaToken = signMfaLoginToken({
        uid: user.id,
        finalMustChange,
        needPolicyChange
      });
      res.json({
        success: true,
        code: 'MFA_REQUIRED',
        message: '请输入验证器中的动态码',
        data: { mfaToken, expiresIn: 300 }
      });
      return;
    }

    const { revokeSessionId } = req.body as LoginBody;

    let revokeId: number | undefined;
    if (revokeSessionId != null) {
      const rid = Number(revokeSessionId);
      if (!Number.isInteger(rid) || rid <= 0) {
        res.status(400).json({ success: false, message: '无效的会话参数' });
        return;
      }
      revokeId = rid;
    }

    let result: { accessToken: string; refreshToken: string };

    try {
      result = await runLoginSessionTransaction(req, user, finalMustChange, revokeId);
    } catch (err: unknown) {
      if (err instanceof SessionLimitError) {
        const sessions = await listActiveSessionsForResponse(err.uid);
        const lim = getMaxSessionSlots(err.role);
        res.status(409).json({
          success: false,
          code: 'SESSION_LIMIT',
          message: '会话数达到上限',
          data: {
            maxSessions: lim,
            sessions,
            showVipLink: err.role === 'user'
          }
        });
        return;
      }
      if (err instanceof InvalidRevokeSessionError) {
        res.status(400).json({
          success: false,
          message: '无效的会话或已失效'
        });
        return;
      }
      throw err;
    }

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          storage_quota: Number(user.storageQuota),
          storage_used: Number(user.storageUsed),
          must_change_password: finalMustChange,
          avatar_url: user.avatarUrl ?? null,
          vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
          created_at: user.createdAt.toISOString(),
          totp_enabled: user.totpEnabled
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        ...(needPolicyChange
          ? {
              password_policy_hint: describePasswordPolicy(policy),
              password_policy: policyToPublicDTO(policy)
            }
          : {})
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
};

/**
 * 第二步：提交 TOTP 动态码，校验 mfaToken 后发正式登录 Token
 */
export const verifyMfaLogin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as { mfaToken?: string; code?: string; revokeSessionId?: number };
    const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (!mfaToken || !code) {
      res.status(400).json({ success: false, message: '请提供 mfaToken 与 6 位动态码' });
      return;
    }

    const payload = parseMfaLoginToken(mfaToken);
    if (!payload) {
      res.status(401).json({ success: false, message: '验证已过期，请从用户名密码重新登录' });
      return;
    }

    const user = (await prisma.user.findUnique({
      where: { id: payload.uid }
    })) as UserWithTotp | null;
    if (!user || user.status !== 'active') {
      res.status(401).json({ success: false, message: '用户无效' });
      return;
    }
    if (
      !user.totpEnabled ||
      !user.totpSecret ||
      verifySync({ token: code, secret: user.totpSecret }).valid === false
    ) {
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: 'MFA 验证失败'
        }
      });
      res.status(401).json({ success: false, message: '动态码错误' });
      return;
    }

    const finalMustChange = payload.fc === 1;
    const needPolicyChange = payload.pc === 1;
    const settings = await getSystemSettings();
    const policy = settingsRowToPolicy(settings);

    let revokeId: number | undefined;
    if (body.revokeSessionId != null) {
      const rid = Number(body.revokeSessionId);
      if (!Number.isInteger(rid) || rid <= 0) {
        res.status(400).json({ success: false, message: '无效的会话参数' });
        return;
      }
      revokeId = rid;
    }

    let result: { accessToken: string; refreshToken: string };
    try {
      result = await runLoginSessionTransaction(req, user, finalMustChange, revokeId);
    } catch (err: unknown) {
      if (err instanceof SessionLimitError) {
        const sessions = await listActiveSessionsForResponse(err.uid);
        const lim = getMaxSessionSlots(err.role);
        res.status(409).json({
          success: false,
          code: 'SESSION_LIMIT',
          message: '会话数达到上限',
          data: { maxSessions: lim, sessions, showVipLink: err.role === 'user' }
        });
        return;
      }
      if (err instanceof InvalidRevokeSessionError) {
        res.status(400).json({ success: false, message: '无效的会话或已失效' });
        return;
      }
      throw err;
    }

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          storage_quota: Number(user.storageQuota),
          storage_used: Number(user.storageUsed),
          must_change_password: finalMustChange,
          avatar_url: user.avatarUrl ?? null,
          vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
          created_at: user.createdAt.toISOString(),
          totp_enabled: true
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        ...(needPolicyChange
          ? {
              password_policy_hint: describePasswordPolicy(policy),
              password_policy: policyToPublicDTO(policy)
            }
          : {})
      }
    });
  } catch (error) {
    console.error('verifyMfaLogin error:', error);
    res.status(500).json({ success: false, message: '验证失败，请稍后重试' });
  }
};

const TOTP_ISSUER = 'FileManagement';

/**
 * 开始绑定 TOTP（仅生成临时密钥，需 confirm 后生效；任意已登录用户可选开启）
 */
export const mfaSetupStart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const user = (await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true, username: true } as unknown as Prisma.UserSelect
    })) as { id: number; totpEnabled: boolean; username: string } | null;
    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }
    if (user.totpEnabled) {
      res.status(400).json({ success: false, message: '已开启两步验证，请先关闭后再重新绑定' });
      return;
    }

    const secret = generateSecret();
    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData({ totpSetupSecret: secret })
    });
    const otpauthUrl = generateURI({
      issuer: TOTP_ISSUER,
      label: user.username,
      secret
    });

    res.json({
      success: true,
      data: {
        otpauthUrl,
        accountLabel: user.username
      }
    });
  } catch (error) {
    console.error('mfaSetupStart error:', error);
    res.status(500).json({ success: false, message: '生成绑定信息失败' });
  }
};

/** 确认绑定：校验动态码，写入 totpEnabled */
export const mfaSetupConfirm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const code = typeof (req.body as { code?: string })?.code === 'string'
      ? (req.body as { code: string }).code.trim().replace(/\s/g, '')
      : '';
    if (!userId) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    if (code.length !== 6) {
      res.status(400).json({ success: false, message: '请输入 6 位动态码' });
      return;
    }

    const user = (await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true, totpSetupSecret: true } as unknown as Prisma.UserSelect
    })) as {
      id: number;
      totpEnabled: boolean;
      totpSetupSecret: string | null;
    } | null;
    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }
    if (user.totpEnabled || !user.totpSetupSecret) {
      res.status(400).json({ success: false, message: '无待确认绑定，请先在设置中开始绑定' });
      return;
    }
    if (!verifySync({ token: code, secret: user.totpSetupSecret }).valid) {
      res.status(400).json({ success: false, message: '动态码错误' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData({
        totpEnabled: true,
        totpSecret: user.totpSetupSecret,
        totpSetupSecret: null
      })
    });

    res.json({ success: true, message: '两步验证已开启' });
  } catch (error) {
    console.error('mfaSetupConfirm error:', error);
    res.status(500).json({ success: false, message: '确认失败' });
  }
};

/** 放弃本次未完成的绑定 */
export const mfaSetupCancel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const u = (await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true } as unknown as Prisma.UserSelect
    })) as { id: number; totpEnabled: boolean } | null;
    if (!u) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }
    if (u.totpEnabled) {
      res.status(400).json({ success: false, message: '已开启，请用「关闭两步验证」' });
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData({ totpSetupSecret: null })
    });
    res.json({ success: true, message: '已取消' });
  } catch (error) {
    console.error('mfaSetupCancel error:', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/** 关闭 TOTP */
export const mfaDisable = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const body = req.body as { password?: string; code?: string };
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (!userId) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    if (!password) {
      res.status(400).json({ success: false, message: '请输入登录密码' });
      return;
    }
    if (code.length !== 6) {
      res.status(400).json({ success: false, message: '请输入验证器 6 位码' });
      return;
    }

    const user = (await prisma.user.findUnique({
      where: { id: userId }
    })) as UserWithTotp | null;
    if (!user || !user.totpEnabled || !user.totpSecret) {
      res.status(400).json({ success: false, message: '未开启两步验证' });
      return;
    }
    if (hashPassword(password) !== user.password) {
      res.status(400).json({ success: false, message: '密码错误' });
      return;
    }
    if (!verifySync({ token: code, secret: user.totpSecret }).valid) {
      res.status(400).json({ success: false, message: '动态码错误' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData({
        totpEnabled: false,
        totpSecret: null,
        totpSetupSecret: null,
        sessionVersion: { increment: 1 }
      })
    });

    res.json({ success: true, message: '已关闭两步验证' });
  } catch (error) {
    console.error('mfaDisable error:', error);
    res.status(500).json({ success: false, message: '操作失败' });
  }
};

/**
 * 忘记密码：向管理员发送站内消息（需用户与管理员为好友；注册时已自动建立）
 */
export const forgotPasswordRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = (req.body as { username?: string })?.username?.trim();
    if (!username) {
      res.status(400).json({
        success: false,
        message: '请填写用户名'
      });
      return;
    }

    const adminId = await getPrimaryAdminId();
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true }
    });

    if (adminId && user && user.role !== 'admin') {
      try {
        await ensureFriendshipWithAdmin(user.id);
        const created = await prisma.message.create({
          data: {
            senderId: user.id,
            receiverId: adminId,
            content: `[忘记密码] 用户 ${user.username}（ID:${user.id}）请求管理员重置密码。`,
            messageType: 'text'
          }
        });
        const full = await loadMessageForEmit(created.id);
        if (full) {
          emitToUser(adminId, 'message:new', { message: full });
        }
      } catch (e) {
        console.error('forgotPassword: message/friendship failed:', e);
      }
    }

    res.json({
      success: true,
      message: '请等待管理员重置密码'
    });
  } catch (error) {
    console.error('Forgot password request error:', error);
    res.status(500).json({
      success: false,
      message: '请求失败，请稍后重试'
    });
  }
};

/**
 * 刷新 Access Token
 */
export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: '请提供 Refresh Token'
      });
      return;
    }

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        isRevoked: false,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            status: true,
            mustChangePassword: true,
            sessionVersion: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      res.status(401).json({
        success: false,
        message: 'Refresh Token 无效或已过期'
      });
      return;
    }

    if (tokenRecord.user.status !== 'active') {
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { isRevoked: true }
      });
      res.status(403).json({
        success: false,
        message: '账号处在封禁状态，请联系管理员'
      });
      return;
    }

    // 更新最后使用时间并生成新的 Access Token
    const result = await prisma.$transaction(async (tx) => {
      // 更新最后使用时间
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date() }
      });

      // 生成新的 Access Token
      const newAccessToken = generateAccessToken(
        tokenRecord.user.id,
        tokenRecord.user.username,
        tokenRecord.user.mustChangePassword,
        tokenRecord.user.sessionVersion
      );
      
      return { newAccessToken };
    });

    res.json({
      success: true,
      message: 'Token 刷新成功',
      data: {
        accessToken: result.newAccessToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token 刷新失败'
    });
  }
};

/**
 * 用户登出
 */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // 撤销 Refresh Token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { isRevoked: true }
      });
    }

    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: '登出失败'
    });
  }
};

/**
 * 修改密码（含：使用管理员临时密码登录后的强制修改）
 */
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!newPassword) {
      res.status(400).json({ success: false, message: '请提供新密码' });
      return;
    }

    const settingsPw = await getSystemSettings();
    const strengthErr = validatePasswordStrengthWithPolicy(newPassword, settingsRowToPolicy(settingsPw));
    if (strengthErr) {
      res.status(400).json({ success: false, message: strengthErr });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        password: true,
        storageQuota: true,
        storageUsed: true,
        mustChangePassword: true,
      },
    });
    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    if (user.mustChangePassword) {
      // 管理员重置后的首次改密：不要求填写当前（临时）密码
    } else {
      if (!currentPassword) {
        res.status(400).json({ success: false, message: '请提供当前密码' });
        return;
      }
      if (hashPassword(currentPassword) !== user.password) {
        res.status(400).json({ success: false, message: '当前密码错误' });
        return;
      }
    }

    if (hashPassword(newPassword) === user.password) {
      res.status(400).json({ success: false, message: '新密码不能与当前密码相同' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashPassword(newPassword),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });

    const userAfter = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    const accessToken = generateAccessToken(
      user.id,
      user.username,
      false,
      userAfter?.sessionVersion ?? 0
    );

    res.json({
      success: true,
      message: '密码已修改',
      data: {
        accessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          storage_quota: Number(user.storageQuota),
          storage_used: Number(user.storageUsed),
          must_change_password: false
        }
      }
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: '修改密码失败' });
  }
};

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const user = (await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        storageQuota: true,
        storageUsed: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        avatarUrl: true,
        vipExpireAt: true,
        totpEnabled: true,
        totpSetupSecret: true
      } as unknown as Prisma.UserSelect
    })) as {
      id: number;
      username: string;
      email: string | null;
      role: Role;
      storageQuota: bigint;
      storageUsed: bigint;
      status: Status;
      mustChangePassword: boolean;
      createdAt: Date;
      avatarUrl: string | null;
      vipExpireAt: Date | null;
      totpEnabled: boolean;
      totpSetupSecret: string | null;
    } | null;

    if (!user) {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        storage_quota: Number(user.storageQuota),
        storage_used: Number(user.storageUsed),
        status: user.status,
        must_change_password: user.mustChangePassword,
        created_at: user.createdAt,
        avatar_url: user.avatarUrl ?? null,
        vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
        totp_enabled: user.totpEnabled,
        mfa_setup_pending: Boolean(user.totpSetupSecret)
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
};

/**
 * 当前用户活跃会话列表（顶栏「会话管理」）
 * POST body 可选 refreshToken：用于标记 currentSessionId（本机）
 */
export const postMySessionsList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const clientRt = (req.body as { refreshToken?: string })?.refreshToken;

    const sessions = await listActiveSessionsForResponse(userId);

    let currentSessionId: number | null = null;
    if (clientRt && typeof clientRt === 'string') {
      const row = await prisma.refreshToken.findFirst({
        where: { token: clientRt, userId, isRevoked: false },
        select: { id: true }
      });
      if (row) currentSessionId = row.id;
    }

    res.json({
      success: true,
      data: { sessions, currentSessionId }
    });
  } catch (error) {
    console.error('postMySessionsList error:', error);
    res.status(500).json({ success: false, message: '获取会话列表失败' });
  }
};

/**
 * 批量撤销所选 refresh 会话并递增 session_version（与登录踢人一致，使被踢端立即失效）
 */
export const revokeMySessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const body = req.body as { ids?: unknown; refreshToken?: string };
    const { ids, refreshToken: clientRefresh } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, message: '请选择要登出的会话' });
      return;
    }

    const uniqueIds = [...new Set(ids.map((x) => Number(x)))].filter(
      (n) => Number.isInteger(n) && n > 0
    );
    if (uniqueIds.length === 0) {
      res.status(400).json({ success: false, message: '无效的会话参数' });
      return;
    }

    let currentSessionId: number | null = null;
    if (clientRefresh && typeof clientRefresh === 'string') {
      const row = await prisma.refreshToken.findFirst({
        where: { token: clientRefresh, userId, isRevoked: false },
        select: { id: true }
      });
      if (row) currentSessionId = row.id;
    }

    const revokeSelf = currentSessionId !== null && uniqueIds.includes(currentSessionId);

    try {
      await prisma.$transaction(
        async (tx) => {
          const revoked = await tx.refreshToken.updateMany({
            where: { userId, id: { in: uniqueIds }, isRevoked: false },
            data: { isRevoked: true }
          });
          if (revoked.count !== uniqueIds.length) {
            throw new InvalidRevokeSessionError();
          }

          await tx.user.update({
            where: { id: userId },
            data: { sessionVersion: { increment: 1 } }
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000
        }
      );
    } catch (err: unknown) {
      if (err instanceof InvalidRevokeSessionError) {
        res.status(400).json({ success: false, message: '部分会话无效或已失效' });
        return;
      }
      throw err;
    }

    if (revokeSelf) {
      res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED_SELF',
        message: '当前设备会话已登出，请重新登录'
      });
      return;
    }

    res.json({ success: true, message: '已登出所选设备' });
  } catch (error) {
    console.error('revokeMySessions error:', error);
    res.status(500).json({ success: false, message: '操作失败，请稍后重试' });
  }
};