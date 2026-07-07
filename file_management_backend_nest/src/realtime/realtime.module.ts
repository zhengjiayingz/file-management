import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { RedisModule } from '@/redis/redis.module';
import { ContactsGateway } from './contacts.gateway';
import { RealtimeEmitterService } from './realtime-emitter.service';

@Module({
  imports: [AuthModule, RedisModule],
  providers: [ContactsGateway, RealtimeEmitterService],
  exports: [RealtimeEmitterService],
})
export class RealtimeModule {}
