import { Request } from 'express';

// JWT Payload 类型
export interface JwtPayload {
  id: number;
  username: string;
  role: string;
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
  email?: string;
}

// API 响应格式
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
}
