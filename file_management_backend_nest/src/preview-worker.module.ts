import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@/prisma/prisma.module';
import { OperationLogService } from '@/operation-log/operation-log.service';
import { PREVIEW_QUEUE_NAME } from '@/files/preview/preview-queue.types';
import { PreviewQueueService } from '@/files/preview/preview-queue.service';
import { FilesPreviewService } from '@/files/preview/files-preview.service';
import { PreviewProcessor } from '@/files/preview/preview.processor';

/** 独立预览 Worker 进程（docker worker / pnpm start:worker） */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: PREVIEW_QUEUE_NAME }),
  ],
  providers: [
    PreviewQueueService,
    OperationLogService,
    FilesPreviewService,
    PreviewProcessor,
  ],
})
export class PreviewWorkerModule {}
