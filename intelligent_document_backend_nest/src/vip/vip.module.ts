import { Module } from '@nestjs/common';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { OperationLogModule } from '@/operation-log/operation-log.module';
import { RealtimeModule } from '@/realtime/realtime.module';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Module({
  imports: [OperationLogModule, RealtimeModule],
  controllers: [VipController],
  providers: [VipService, PasswordPolicyService, RolesGuard],
})
export class VipModule {}
