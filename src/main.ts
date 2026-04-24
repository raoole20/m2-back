import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LogLevel } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

function resolveLogLevels(): LogLevel[] {
  const env = (process.env.LOG_LEVEL ?? 'lite').toLowerCase();
  if (env === 'full' || env === 'debug') {
    return ['log', 'warn', 'error', 'debug', 'verbose'];
  }
  if (env === 'lite') {
    return ['log', 'warn', 'error'];
  }
  if (env === 'quiet') {
    return ['warn', 'error'];
  }
  const custom = env.split(',').map((s) => s.trim()).filter(Boolean);
  if (custom.length > 0) return custom as LogLevel[];
  return ['log', 'warn', 'error'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: resolveLogLevels(),
  });

  // Security
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: ['health', 'webhooks/(.*)'],
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger
  if (process.env.SWAGGER_ENABLED !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('M2 API')
      .setDescription('Centralized AI communications platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT || process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
