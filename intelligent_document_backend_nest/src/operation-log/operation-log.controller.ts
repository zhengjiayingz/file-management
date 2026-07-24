import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { RequestUser } from '@/auth/types/jwt-payload.type';
import { OperationLogQueryService } from './operation-log-query.service';

@Controller('logs')
export class OperationLogController {
  constructor(private readonly queryService: OperationLogQueryService) {}

  @Get()
  getOperationLogs(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.queryService.getOperationLogs(user, req);
  }
}
