import { Module } from '@nestjs/common';
import { OperationLogController } from './operation-log.controller';
import { OperationLogQueryService } from './operation-log-query.service';
import { OperationLogService } from './operation-log.service';

@Module({
  controllers: [OperationLogController],
  providers: [OperationLogService, OperationLogQueryService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
