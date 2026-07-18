import { Module } from '@nestjs/common';
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
import { PaymentIntentController } from './payments/payment-intent.controller';
import { PaymentIntentService } from './payments/payment-intent.service';
import { PaymentExpirationSchedulerService } from './payments/payment-expiration-scheduler.service';
import { PaymentReminderSchedulerService } from './payments/payment-reminder-scheduler.service';
import { WompiMockProvider } from './payments/wompi-mock.provider';
import { WOMPI_PROVIDER } from './payments/wompi-provider';
import { WompiWebhookController } from './payments/wompi-webhook.controller';
import { WompiWebhookService } from './payments/wompi-webhook.service';
import { WompiReconciliationSchedulerService } from './payments/wompi-reconciliation-scheduler.service';
import { ShopifyReconciliationController } from './reconciliation/shopify-reconciliation.controller';
import { ShopifyReconciliationService } from './reconciliation/shopify-reconciliation.service';
import { TransportRateController } from './rates/transport-rate.controller';
import { TransportRateResolver } from './rates/transport-rate-resolver';
import { TransportRateService } from './rates/transport-rate.service';
import { OrderClassificationService } from './orders/order-classification.service';
import { OrderClassifier } from './orders/order-classifier';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { OutboxQueueService } from './outbox/outbox-queue.service';
import { DlqOperationsController } from './outbox/dlq-operations.controller';
import { DlqOperationsService } from './outbox/dlq-operations.service';
import { ShopifyCredentialCipher } from './shopify/shopify-credential-cipher';
import { ShopifyIntegrationController } from './shopify/shopify-integration.controller';
import { ShopifyIntegrationService } from './shopify/shopify-integration.service';
import { ShopifyMockProvider } from './shopify/shopify-mock.provider';
import { ShopifyOrderNormalizer } from './shopify/shopify-order-normalizer';
import { ShopifyOrderSyncService } from './shopify/shopify-order-sync.service';
import { SHOPIFY_PROVIDER } from './shopify/shopify-provider';
import { ShopifyWebhookController } from './shopify/shopify-webhook.controller';
import { ShopifyWebhookService } from './shopify/shopify-webhook.service';
import { WhatsAppCredentialCipher } from './whatsapp/whatsapp-credential-cipher';
import { WhatsAppIntegrationController } from './whatsapp/whatsapp-integration.controller';
import { WhatsAppIntegrationService } from './whatsapp/whatsapp-integration.service';
import { WhatsAppMockProvider } from './whatsapp/whatsapp-mock.provider';
import { WhatsAppMessageController } from './whatsapp/whatsapp-message.controller';
import { WhatsAppMessageService } from './whatsapp/whatsapp-message.service';
import { WHATSAPP_PROVIDER } from './whatsapp/whatsapp-provider';
import { WhatsAppTemplateController } from './whatsapp/whatsapp-template.controller';
import { WhatsAppTemplateService } from './whatsapp/whatsapp-template.service';
import { WhatsAppStatusController } from './whatsapp/whatsapp-status.controller';
import { WhatsAppStatusService } from './whatsapp/whatsapp-status.service';
import { WhatsAppInboundController } from './whatsapp/whatsapp-inbound.controller';
import { WhatsAppInboundService } from './whatsapp/whatsapp-inbound.service';

@Module({
  controllers: [
    AuthController,
    DlqOperationsController,
    HealthController,
    IdentityAdministrationController,
    MetricsController,
    ShopifyIntegrationController,
    ShopifyWebhookController,
    ShopifyReconciliationController,
    TransportRateController,
    PaymentIntentController,
    WompiWebhookController,
    WhatsAppIntegrationController,
    WhatsAppMessageController,
    WhatsAppInboundController,
    WhatsAppStatusController,
    WhatsAppTemplateController,
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
    OrderClassifier,
    OrderClassificationService,
    RequestObservabilityMiddleware,
    HealthService,
    IdentityAdministrationService,
    DependencyHealthService,
    OutboxQueueService,
    OutboxPublisherService,
    DlqOperationsService,
    ShopifyCredentialCipher,
    ShopifyIntegrationService,
    ShopifyWebhookService,
    ShopifyOrderNormalizer,
    ShopifyOrderSyncService,
    ShopifyReconciliationService,
    TransportRateResolver,
    TransportRateService,
    PaymentIntentService,
    PaymentExpirationSchedulerService,
    PaymentReminderSchedulerService,
    WompiWebhookService,
    WompiReconciliationSchedulerService,
    WhatsAppCredentialCipher,
    WhatsAppIntegrationService,
    WhatsAppMessageService,
    WhatsAppInboundService,
    WhatsAppStatusService,
    WhatsAppTemplateService,
    WhatsAppMockProvider,
    WompiMockProvider,
    ShopifyMockProvider,
    { provide: WOMPI_PROVIDER, useExisting: WompiMockProvider },
    { provide: SHOPIFY_PROVIDER, useExisting: ShopifyMockProvider },
    { provide: WHATSAPP_PROVIDER, useExisting: WhatsAppMockProvider },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
