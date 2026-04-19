/** 简单邮箱格式校验（与 HTML5 input type=email 大致同级） */
export function isValidEmailFormat(email: string): boolean {
  const s = email.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
