import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  configureApp(app);

  // Listen on all interfaces so physical devices on the LAN can reach the API.
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
