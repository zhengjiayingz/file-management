import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, port = 3000): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('File Management System API')
    .setDescription('文件管理系统 RESTful API 文档（Nest）')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addServer(`http://localhost:${port}`)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);
}
