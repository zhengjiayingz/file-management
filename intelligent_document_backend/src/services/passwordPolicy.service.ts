import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import type { SystemSettingsRow } from '../types/systemSettingsRow.js';

/** 管理员重置用户密码后的统一临时密码（不符合常规强度策略，登录后须强制修改） */
export const ADMIN_TEMP_RESET_PASSWORD = '111111';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export type PasswordCategoryKey = 'digit' | 'lower' | 'upper' | 'special';

export const PASSWORD_CATEGORY_ORDER: PasswordCategoryKey[] = ['digit', 'lower', 'upper', 'special'];

const CATEGORY_LABEL_ZH: Record<PasswordCategoryKey, string> = {
  digit: '数字',
  lower: '小写字母',
  upper: '大写字母',
  special: '特殊字符'
};

const CATEGORY_TEST: Record<PasswordCategoryKey, RegExp> = {
  digit: /\d/,
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[!@#$%^&*(),.?":{}|<>]/
};

export type PasswordPolicy = {
  minLength: number;
  /** 参与评分的字符类别（管理员勾选） */
  requiredCategories: PasswordCategoryKey[];
  /** 在 requiredCategories 中至少须满足几类 */
  minCategoriesInPool: number;
};

/** 从请求体或 JSON 列解析为有序、去重后的类别列表；无效或为空时回退 fallback */
export function normalizeRequiredCategories(
  input: unknown,
  fallback: PasswordCategoryKey[]
): PasswordCategoryKey[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...fallback];
  }
  const allowed = new Set<string>(PASSWORD_CATEGORY_ORDER);
  const picked = new Set<string>();
  for (const x of input) {
    if (typeof x === 'string' && allowed.has(x)) {
      picked.add(x);
    }
  }
  if (picked.size === 0) {
    return [...fallback];
  }
  return PASSWORD_CATEGORY_ORDER.filter((k) => picked.has(k));
}

/** 管理员保存专用：至少一类；仅非法值时返回 null */
export function parseAdminRequiredCategories(input: unknown): PasswordCategoryKey[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }
  const allowed = new Set<string>(PASSWORD_CATEGORY_ORDER);
  const picked = new Set<string>();
  for (const x of input) {
    if (typeof x === 'string' && allowed.has(x)) {
      picked.add(x);
    }
  }
  if (picked.size === 0) {
    return null;
  }
  return PASSWORD_CATEGORY_ORDER.filter((k) => picked.has(k));
}

export function parseRequiredCategoriesFromSettingsJson(
  value: Prisma.JsonValue | null | undefined,
  fallback: PasswordCategoryKey[]
): PasswordCategoryKey[] {
  return normalizeRequiredCategories(value, fallback);
}

/** 与 `getSystemSettings()` 返回的 Prisma `SystemSettings` 一致 */
export function settingsRowToPolicy(row: SystemSettingsRow): PasswordPolicy {
  const fallback: PasswordCategoryKey[] = ['digit', 'lower', 'upper', 'special'];
  const requiredCategories = parseRequiredCategoriesFromSettingsJson(row.passwordRequiredCategories, fallback);
  const n = requiredCategories.length;
  let m = Math.floor(Number(row.passwordMinCategoriesInPool));
  if (!Number.isFinite(m)) {
    m = n;
  }
  if (n <= 0) {
    return {
      minLength: Math.max(1, Math.min(128, row.passwordMinLength)),
      requiredCategories: [],
      minCategoriesInPool: 0
    };
  }
  m = Math.max(1, Math.min(n, m));
  return {
    minLength: Math.max(1, Math.min(128, row.passwordMinLength)),
    requiredCategories,
    minCategoriesInPool: m
  };
}

/** 返回错误文案；通过则返回 null */
export function validatePasswordStrengthWithPolicy(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) {
    return `密码长度至少${policy.minLength}位`;
  }
  const pool = policy.requiredCategories;
  if (pool.length === 0) {
    return null;
  }
  const need = policy.minCategoriesInPool;
  let satisfied = 0;
  for (const key of pool) {
    if (CATEGORY_TEST[key].test(password)) {
      satisfied++;
    }
  }
  if (satisfied >= need) {
    return null;
  }
  const labels = pool.map((k) => CATEGORY_LABEL_ZH[k]).join('、');
  return `在${labels}中至少须满足${need}类（当前满足${satisfied}类）`;
}

/** 供登录提示与管理员界面展示 */
export function describePasswordPolicy(policy: PasswordPolicy): string {
  const { minLength, requiredCategories, minCategoriesInPool: m } = policy;
  if (requiredCategories.length === 0) {
    return `至少${minLength}位`;
  }
  const labels = requiredCategories.map((k) => CATEGORY_LABEL_ZH[k]).join('、');
  if (m >= requiredCategories.length) {
    return `至少${minLength}位，且须同时包含：${labels}`;
  }
  return `至少${minLength}位；在${labels}中至少满足${m}类`;
}

/** 供公开接口返回结构化策略 */
export function policyToPublicDTO(policy: PasswordPolicy): {
  minLength: number;
  requiredCategories: PasswordCategoryKey[];
  minCategoriesInPool: number;
} {
  return {
    minLength: policy.minLength,
    requiredCategories: [...policy.requiredCategories],
    minCategoriesInPool: policy.minCategoriesInPool
  };
}
