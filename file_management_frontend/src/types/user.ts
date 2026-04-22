import type { PasswordCategoryKey } from '@utils/passwordStrength';

// 用户角色枚举
export type UserRole = 'user' | 'vip' | 'admin';

// 用户基本信息接口
export interface User {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  avatar?: string;
  storageQuota: number; // 存储配额 (字节)
  storageUsed: number;  // 已用存储 (字节)
  createdAt: string;
  /** 管理员重置后的临时密码登录时为 true，须先改密 */
  mustChangePassword?: boolean;
  /** VIP 到期时间 ISO 字符串，非 VIP 常为 null */
  vipExpireAt?: string | null;
  /** 是否已开启 TOTP 两步验证（所有角色均可选开） */
  totpEnabled?: boolean;
  /** 是否有未完成的 TOTP 绑定（已生成密钥未确认） */
  mfaSetupPending?: boolean;
}

// 登录成功响应数据
export interface LoginResult {
  message: string;
  token: string;
  refreshToken: string;
  user: User;
  /** 当前密码不符合管理员新策略时，后端返回的策略摘要 */
  passwordPolicyHint?: string;
  passwordPolicy?: {
    minLength: number;
    requiredCategories: PasswordCategoryKey[];
    minCategoriesInPool: number;
  };
}

/** 登录接口：要么要求第二步 MFA，要么直接成功 */
export type LoginFlowResult =
  | { mfaRequired: true; mfaToken: string; message?: string }
  | ({ mfaRequired: false } & LoginResult)

// 注册成功响应数据
export interface RegisterResult {
  message: string;
  user: User;
}
