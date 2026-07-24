import { Module } from '@nestjs/common';
import { AdminFriendModule } from '@/common/admin-friend/admin-friend.module';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AdminFriendModule],
  controllers: [AdminController],
  providers: [AdminService, PasswordPolicyService, RolesGuard],
})
export class AdminModule {}
