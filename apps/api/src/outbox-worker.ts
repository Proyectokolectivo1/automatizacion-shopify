import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { OutboxWorkerModule } from './outbox/outbox-worker.module';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.createApplicationContext(OutboxWorkerModule, {
    logger: false,
  });
  application.enableShutdownHooks();
}

void bootstrap();
