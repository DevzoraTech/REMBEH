import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/database/prisma-exception.filter';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://rembeh.antikra.com',
  'https://rembeh.antikra.com',
  'http://13.63.130.241',
  'https://13.63.130.241',
];

function resolveCorsOrigin():
  | boolean
  | string[]
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    // Reflect request Origin (required when credentials: true; '*' is invalid).
    return true;
  }

  const allowed = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.includes('*')) {
    return true;
  }

  const origins = Array.from(new Set([...allowed, ...DEFAULT_CORS_ORIGINS]));

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Non-browser / same-origin tools often omit Origin.
    if (!origin || origins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  };
}

export function configureApp(app: INestApplication) {
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Disposition'],
    optionsSuccessStatus: 204,
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
