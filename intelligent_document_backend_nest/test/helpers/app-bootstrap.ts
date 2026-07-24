import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { setupSwagger } from '@/common/swagger/setup-swagger';

export type E2eApp = INestApplication<App>;

export async function createE2eApp(): Promise<E2eApp> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  app.setGlobalPrefix('api', {
    exclude: ['health', 'api-docs', 'api-docs-json'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  setupSwagger(app, 3000);
  await app.init();
  return app as E2eApp;
}
