import { Global, Module } from '@nestjs/common';
import { AdminFriendService } from './admin-friend.service';

@Global()
@Module({
  providers: [AdminFriendService],
  exports: [AdminFriendService],
})
export class AdminFriendModule {}
