import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { EnvironmentService } from './config/environment.service';
import { PrismaService } from './database/prisma.service';
import { FoundationTransactionService } from './foundation/foundation-transaction.service';
import { DependencyHealthService } from './health/dependency-health.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AppLoggerService } from './observability/app-logger.service';
import { GlobalExceptionFilter } from './observability/global-exception.filter';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { RequestContextService } from './observability/request-context.service';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { OutboxQueueService } from './outbox/outbox-queue.service';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    EnvironmentService,
    PrismaService,
    FoundationTransactionService,
    RequestContextService,
    AppLoggerService,
    MetricsService,
    RequestObservabilityMiddleware,
    HealthService,
    DependencyHealthService,
    OutboxQueueService,
    OutboxPublisherService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes({ method: RequestMethod.ALL, path: '*splat' });
  }
}
