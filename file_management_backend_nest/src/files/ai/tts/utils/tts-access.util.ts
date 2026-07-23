/**
 * 是否允许在文档预览里使用「划词朗读」。
 * 独立「文字转语音」页不看此开关，登录即可用。
 * @param user.role 账号角色；admin 固定可用划词朗读
 * @param user.ttsEnabled 管理员为该用户开通的划词朗读开关；默认 false
 */
export function canUseTts(user: {
  role: string;
  ttsEnabled: boolean;
}): boolean {
  return user.role === 'admin' || user.ttsEnabled === true;
}
