import './instrument.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { runMigrations } from '@tandemu/database';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

async function bootstrap() {
  const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/tandemu';
  await runMigrations(databaseUrl);

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}

bootstrap();
