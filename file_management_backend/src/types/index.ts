import { Request } from 'express';

// JWT Payload 类型
export interface JwtPayload {
  id: number;
  username: string;
  role?: string;
  /** 为 true 时表示临时密码登录，仅允许修改密码等白名单接口 */
  mustChangePassword?: boolean;
  /** 须与用户表 sessionVersion 一致，否则视为已失效 */
  sv?: number;
}

// 扩展 Express Request 类型
export interface AuthRequest extends Request {
  user?: JwtPayload & { status?: string };
}

// 登录请求体
export interface LoginBody {
  username: string;
  password: string;
}

// 注册请求体
export interface RegisterBody {
  username: string;
  password: string;
  email?: string;
}

// 更新用户资料请求体
export interface UpdateProfileBody {
  /** 传空字符串表示清空邮箱 */
  email?: string | null;
}

// API 响应格式
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
}
