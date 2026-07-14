import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuditService } from './auth/audit.service';
import { AccountActionService } from './auth/account-action.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PasswordService } from './auth/password.service';
import { RbacGuard } from './auth/rbac.guard';
import { EnvironmentService } from './config/environment.service';
import { PrismaService } from './database/prisma.service';
import { EmailDeliveryService } from './email/email-delivery.service';
import { FoundationTransactionService } from './foundation/foundation-transaction.service';
import { DependencyHealthService } from './health/dependency-health.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { IdentityAdministrationController } from './identity/identity-administration.controller';
import { IdentityAdministrationService } from './identity/identity-administration.service';
import { AppLoggerService } from './observability/app-logger.service';
import { GlobalExceptionFilter } from './observability/global-exception.filter';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { RequestContextService } from './observability/request-context.service';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { OutboxQueueService } from './outbox/outbox-queue.service';
import { DlqOperationsController } from './outbox/dlq-operations.controller';
import { DlqOperationsService } from './outbox/dlq-operations.service';

@Module({
  controllers: [
    AuthController,
    DlqOperationsController,
    HealthController,
    IdentityAdministrationController,
    MetricsController,
  ],
  providers: [
    EnvironmentService,
    PrismaService,
    AuditService,
    AccountActionService,
    AuthRateLimitService,
    PasswordService,
    AuthService,
    AuthGuard,
    RbacGuard,
    EmailDeliveryService,
    FoundationTransactionService,
    RequestContextService,
    AppLoggerService,
    MetricsService,
    RequestObservabilityMiddleware,
    HealthService,
    IdentityAdministrationService,
    DependencyHealthService,
    OutboxQueueService,
    OutboxPublisherService,
    DlqOperationsService,
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
