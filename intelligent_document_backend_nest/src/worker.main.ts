import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PreviewWorkerModule } from './preview-worker.module';

async function bootstrap() {
  const logger = new Logger('PreviewWorker');
  await NestFactory.createApplicationContext(PreviewWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  logger.log(
    'BullMQ workers started (queues: preview-convert, document-index)',
  );
}

void bootstrap();
