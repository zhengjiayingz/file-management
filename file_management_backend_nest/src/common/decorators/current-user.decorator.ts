import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestUser } from '@/auth/types/jwt-payload.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return request.user;
  },
);
