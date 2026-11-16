import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/config';

/** Delivery worker process: consumes the queue and runs the reconciler. No HTTP server. */
async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ config, api: false, worker: true }));
  app.enableShutdownHooks();
}

void bootstrap();
