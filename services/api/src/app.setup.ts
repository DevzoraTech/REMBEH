import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/database/prisma-exception.filter';

export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
