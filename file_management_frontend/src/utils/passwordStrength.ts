/**
 * 与后端 passwordPolicy.service.ts 中 validatePasswordStrength 规则一致（便于提交前提示）
 */
export type PasswordStrengthCode = 'short' | 'weak'

export function checkPasswordStrength(password: string): PasswordStrengthCode | null {
  if (password.length < 8) {
    return 'short'
  }
  const hasNumber = /\d/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password)
  const strengthCount = [hasNumber, hasLower, hasUpper, hasSpecial].filter(Boolean).length
  if (strengthCount < 3) {
    return 'weak'
  }
  return null
}
