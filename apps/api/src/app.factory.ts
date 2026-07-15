import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw, urlencoded } from 'express';

import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment.service';
import { loadEnvironmentFiles } from './config/load-environment';
import { AppLoggerService } from './observability/app-logger.service';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';

export async function createApplication(): Promise<INestApplication> {
  loadEnvironmentFiles();
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    bodyParser: false,
    logger: false,
  });
  const environment = app.get(EnvironmentService);
  const requestObservability = app.get(RequestObservabilityMiddleware);
  app.use(requestObservability.use.bind(requestObservability));
  app.use(
    '/webhooks/shopify',
    raw({ limit: environment.shopifyWebhooks.maxBodyBytes, type: 'application/json' }),
  );
  app.use(
    '/webhooks/wompi',
    raw({ limit: environment.wompiWebhooks.maxBodyBytes, type: 'application/json' }),
  );
  app.use(
    '/webhooks/whatsapp',
    raw({ limit: environment.whatsappWebhooks.maxBodyBytes, type: 'application/json' }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.useLogger(app.get(AppLoggerService));
  app.enableShutdownHooks();
  return app;
}
