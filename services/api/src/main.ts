import { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: resolveLogLevels(),
  });
  app.useWebSocketAdapter(new IoAdapter(app));

  configureApp(app);

  // Listen on all interfaces so physical devices on the LAN can reach the API.
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();

function resolveLogLevels(): LogLevel[] {
  const valid = new Set<LogLevel>([
    'fatal',
    'error',
    'warn',
    'log',
    'debug',
    'verbose',
  ]);
  const configured = process.env.NEST_LOG_LEVELS?.split(',')
    .map((level) => level.trim().toLowerCase())
    .filter((level): level is LogLevel => valid.has(level as LogLevel));

  if (configured != null && configured.length > 0) {
    return Array.from(new Set(configured));
  }

  // Production must keep actionable failures, not a high-volume debug trace.
  return process.env.NODE_ENV === 'production'
    ? ['fatal', 'error', 'warn', 'log']
    : ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];
}
