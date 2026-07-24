import { Module } from '@nestjs/common';
import { RealtimeModule } from '@/realtime/realtime.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  imports: [RealtimeModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
