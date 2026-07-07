import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class LoginRateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimitService: RateLimitService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (process.env.NODE_ENV === 'test') {
      next();
      return;
    }
    this.rateLimitService.getLoginLimiter()(req, res, next);
  }
}
