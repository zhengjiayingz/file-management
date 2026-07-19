import { Module } from '@nestjs/common';
import { StorageModule } from '@/storage/storage.module';
import { MathTempImagesController } from './controllers/math-temp-images.controller';
import { MathTempImagesService } from './services/math-temp-images.service';
import { MathTempChatService } from './services/math-temp-chat.service';
import { MathTempStreamService } from './services/math-temp-stream.service';
import { MathTempPromoteService } from './services/math-temp-promote.service';

@Module({
  imports: [StorageModule],
  controllers: [MathTempImagesController],
  providers: [
    MathTempImagesService,
    MathTempChatService,
    MathTempStreamService,
    MathTempPromoteService,
  ],
  exports: [MathTempPromoteService, MathTempImagesService],
})
export class MathTempModule {}
