import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Sales OS API listening on :${port}`);
}
bootstrap();
