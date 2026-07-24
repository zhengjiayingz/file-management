import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import type { JwtPayload, RequestUser } from '../types/jwt-payload.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    let decoded: JwtPayload;
    try {
      decoded = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('无效的认证令牌');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        status: true,
        role: true,
        sessionVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在或认证无效');
    }

    const tokenSv = decoded.sv ?? 0;
    if (tokenSv !== user.sessionVersion) {
      throw new UnauthorizedException({
        success: false,
        message: '登录会话已失效，请重新登录',
        code: 'SESSION_REVOKED',
      });
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('账号处在封禁状态，请联系管理员');
    }

    request.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    };

    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    const queryToken = request.query.token;
    if (typeof queryToken === 'string' && queryToken) {
      return queryToken;
    }
    return null;
  }
}
