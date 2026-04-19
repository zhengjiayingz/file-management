import crypto from 'crypto';

/** 管理员重置用户密码后的统一临时密码（不符合常规强度策略，登录后须强制修改） */
export const ADMIN_TEMP_RESET_PASSWORD = '111111';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/** 返回错误文案；通过则返回 null */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return '密码长度至少8位';
  }
  const hasNumber = /\d/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const strengthCount = [hasNumber, hasLower, hasUpper, hasSpecial].filter(Boolean).length;
  if (strengthCount < 3) {
    return '密码必须包含数字、字母、大小写、特殊字符中至少3种';
  }
  return null;
}
