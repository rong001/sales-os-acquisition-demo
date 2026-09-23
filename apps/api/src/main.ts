import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // API_HOST: native Windows sets 127.0.0.1; Docker/containers leave unset → 0.0.0.0
  const host = process.env.API_HOST || '0.0.0.0';
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  await app.listen(port, host);
  console.log(`Sales OS API listening on ${host}:${port}`);
}
bootstrap();
