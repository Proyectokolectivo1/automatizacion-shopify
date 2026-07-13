import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadEnvironmentFiles } from './config/load-environment';
import { AppLoggerService } from './observability/app-logger.service';

export async function createApplication(): Promise<INestApplication> {
  loadEnvironmentFiles();
  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
  app.useLogger(app.get(AppLoggerService));
  app.enableShutdownHooks();
  return app;
}
