import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_MUST_CHANGE_PASSWORD_KEY } from '../decorators/skip-must-change-password.decorator';
import type { JwtPayload } from '@/auth/types/jwt-payload.type';

const ALLOWED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/change-password',
  '/api/auth/mfa/verify',
]);

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_MUST_CHANGE_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;
    if (ALLOWED_PATHS.has(path)) return true;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return true;

    const token = authHeader.substring(7);
    try {
      const decoded = this.jwtService.verify<JwtPayload>(token);
      if (decoded.mustChangePassword === true) {
        throw new ForbiddenException({
          success: false,
          code: 'MUST_CHANGE_PASSWORD',
          message: '您正在使用管理员重置的临时密码，请先修改密码后再继续使用',
        });
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      return true;
    }
    return true;
  }
}
