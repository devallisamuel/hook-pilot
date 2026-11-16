import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureHttpApp } from './app.module';
import { loadConfig } from './infrastructure/config/config';

/** API process. Set RUN_WORKER_IN_API=true to also run delivery in-process (handy for small deployments). */
async function bootstrap() {
  const config = loadConfig();
  const worker = process.env.RUN_WORKER_IN_API === 'true';
  const app = await NestFactory.create(AppModule.forRoot({ config, api: true, worker }));
  configureHttpApp(app);
  await app.listen(config.port);
  Logger.log(`Hook Pilot API listening on :${config.port} (docs at /docs)${worker ? ' with in-process worker' : ''}`, 'Bootstrap');
}

void bootstrap();
