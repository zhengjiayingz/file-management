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
}

// 登录成功响应数据
export interface LoginResult {
  message: string;
  token: string;
  refreshToken: string;
  user: User;
}

// 注册成功响应数据
export interface RegisterResult {
  message: string;
  user: User;
}
