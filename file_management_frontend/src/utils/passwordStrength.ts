/**
 * 与后端 passwordPolicy.service 校验规则一致（提交前提示）
 */
export type PasswordCategoryKey = 'digit' | 'lower' | 'upper' | 'special'

export const PASSWORD_CATEGORY_ORDER: PasswordCategoryKey[] = ['digit', 'lower', 'upper', 'special']

export type PasswordStrengthCode = 'short' | 'weak'

export type PasswordPolicyClient = {
  minLength: number
  requiredCategories: PasswordCategoryKey[]
  minCategoriesInPool: number
}

const TEST: Record<PasswordCategoryKey, RegExp> = {
  digit: /\d/,
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[!@#$%^&*(),.?":{}|<>]/,
}

export function checkPasswordStrength(password: string, policy: PasswordPolicyClient): PasswordStrengthCode | null {
  if (password.length < policy.minLength) {
    return 'short'
  }
  const pool = policy.requiredCategories
  if (pool.length === 0) {
    return null
  }
  let need = Math.floor(Number(policy.minCategoriesInPool))
  if (!Number.isFinite(need)) {
    need = pool.length
  }
  need = Math.max(1, Math.min(pool.length, need))
  let satisfied = 0
  for (const k of pool) {
    if (TEST[k].test(password)) {
      satisfied++
    }
  }
  if (satisfied >= need) {
    return null
  }
  return 'weak'
}

/** 用于表单旁提示文案（依赖 vue-i18n 的 t） */
/** 将接口返回规范为完整策略（兼容缺省 minCategoriesInPool） */
export function normalizePasswordPolicyClient(d: {
  minLength: number
  requiredCategories?: PasswordCategoryKey[]
  minCategoriesInPool?: number
}): PasswordPolicyClient {
  const pool = d.requiredCategories ?? []
  const n = pool.length
  let m = d.minCategoriesInPool
  if (typeof m !== 'number' || !Number.isFinite(m)) {
    m = n > 0 ? n : 1
  }
  if (n === 0) {
    return { minLength: d.minLength, requiredCategories: [], minCategoriesInPool: 0 }
  }
  return {
    minLength: d.minLength,
    requiredCategories: pool,
    minCategoriesInPool: Math.max(1, Math.min(n, Math.floor(m)))
  }
}

export function buildPasswordPolicyHint(
  policy: PasswordPolicyClient,
  t: (key: string, values?: Record<string, unknown>) => string
): string {
  const pool = policy.requiredCategories
  if (pool.length === 0) {
    return t('passwordPolicy.hintLengthOnly', { min: policy.minLength })
  }
  let m = Math.floor(Number(policy.minCategoriesInPool))
  if (!Number.isFinite(m)) {
    m = pool.length
  }
  m = Math.max(1, Math.min(pool.length, m))
  const cats = pool.map((k) => t(`passwordPolicy.categories.${k}`)).join(t('passwordPolicy.joiner'))
  if (m >= pool.length) {
    return t('passwordPolicy.hintAll', { min: policy.minLength, cats })
  }
  return t('passwordPolicy.hintPool', { min: policy.minLength, cats, m })
}
