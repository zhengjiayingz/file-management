import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { SystemSettings } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type PasswordCategoryKey = 'digit' | 'lower' | 'upper' | 'special';

export type PasswordPolicy = {
  minLength: number;
  requiredCategories: PasswordCategoryKey[];
  minCategoriesInPool: number;
};

export const PASSWORD_CATEGORY_ORDER: PasswordCategoryKey[] = [
  'digit',
  'lower',
  'upper',
  'special',
];

const CATEGORY_LABEL_ZH: Record<PasswordCategoryKey, string> = {
  digit: '数字',
  lower: '小写字母',
  upper: '大写字母',
  special: '特殊字符',
};

const CATEGORY_TEST: Record<PasswordCategoryKey, RegExp> = {
  digit: /\d/,
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[!@#$%^&*(),.?":{}|<>]/,
};

export const ADMIN_TEMP_RESET_PASSWORD = '111111';

@Injectable()
export class PasswordPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  async getSystemSettings(): Promise<SystemSettings> {
    return this.prisma.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  settingsRowToPolicy(row: SystemSettings): PasswordPolicy {
    const fallback: PasswordCategoryKey[] = [
      'digit',
      'lower',
      'upper',
      'special',
    ];
    const requiredCategories = this.parseRequiredCategoriesFromSettingsJsonPrivate(
      row.passwordRequiredCategories,
      fallback,
    );
    const n = requiredCategories.length;
    let m = Math.floor(Number(row.passwordMinCategoriesInPool));
    if (!Number.isFinite(m)) {
      m = n;
    }
    if (n <= 0) {
      return {
        minLength: Math.max(1, Math.min(128, row.passwordMinLength)),
        requiredCategories: [],
        minCategoriesInPool: 0,
      };
    }
    m = Math.max(1, Math.min(n, m));
    return {
      minLength: Math.max(1, Math.min(128, row.passwordMinLength)),
      requiredCategories,
      minCategoriesInPool: m,
    };
  }

  validatePasswordStrengthWithPolicy(
    password: string,
    policy: PasswordPolicy,
  ): string | null {
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

  describePasswordPolicy(policy: PasswordPolicy): string {
    const { minLength, requiredCategories, minCategoriesInPool: m } = policy;
    if (requiredCategories.length === 0) {
      return `至少${minLength}位`;
    }
    const labels = requiredCategories
      .map((k) => CATEGORY_LABEL_ZH[k])
      .join('、');
    if (m >= requiredCategories.length) {
      return `至少${minLength}位，且须同时包含：${labels}`;
    }
    return `至少${minLength}位；在${labels}中至少满足${m}类`;
  }

  policyToPublicDTO(policy: PasswordPolicy): {
    minLength: number;
    requiredCategories: PasswordCategoryKey[];
    minCategoriesInPool: number;
  } {
    return {
      minLength: policy.minLength,
      requiredCategories: [...policy.requiredCategories],
      minCategoriesInPool: policy.minCategoriesInPool,
    };
  }

  parseAdminRequiredCategories(
    input: unknown,
  ): PasswordCategoryKey[] | null {
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

  parseRequiredCategoriesFromSettingsJson(
    value: unknown,
    fallback: PasswordCategoryKey[],
  ): PasswordCategoryKey[] {
    return this.parseRequiredCategoriesFromSettingsJsonPrivate(value, fallback);
  }

  private parseRequiredCategoriesFromSettingsJsonPrivate(
    value: unknown,
    fallback: PasswordCategoryKey[],
  ): PasswordCategoryKey[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [...fallback];
    }
    const allowed = new Set<string>(PASSWORD_CATEGORY_ORDER);
    const picked = new Set<string>();
    for (const x of value) {
      if (typeof x === 'string' && allowed.has(x)) {
        picked.add(x);
      }
    }
    if (picked.size === 0) {
      return [...fallback];
    }
    return PASSWORD_CATEGORY_ORDER.filter((k) => picked.has(k));
  }
}
