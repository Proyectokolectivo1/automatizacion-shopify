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
import { FinanceOverviewController } from './finance/finance-overview.controller';
import { FinanceOverviewService } from './finance/finance-overview.service';
import { DependencyHealthService } from './health/dependency-health.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { IdentityAdministrationController } from './identity/identity-administration.controller';
import { IdentityAdministrationService } from './identity/identity-administration.service';
import { AppLoggerService } from './observability/app-logger.service';
import { AlertingService } from './observability/alerting.service';
import { GlobalExceptionFilter } from './observability/global-exception.filter';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { RequestContextService } from './observability/request-context.service';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';
import { TracingService } from './observability/tracing.service';
import { OperationalQueueController } from './operations/operational-queue.controller';
import { OperationalQueueService } from './operations/operational-queue.service';
import { OperationalDetailController } from './operations/operational-detail.controller';
import { OperationalDetailService } from './operations/operational-detail.service';
import { OperationalExportController } from './operations/operational-export.controller';
import { OperationalExportService } from './operations/operational-export.service';
import { OperationalSummaryService } from './operations/operational-summary.service';
import { OperationalSearchController } from './operations/operational-search.controller';
import { OperationalSearchService } from './operations/operational-search.service';
import { OperationalAlertController } from './operations/operational-alert.controller';
import { OperationalAlertEvaluatorService } from './operations/operational-alert-evaluator.service';
import { OperationalAlertSchedulerService } from './operations/operational-alert-scheduler.service';
import { OperationalAlertService } from './operations/operational-alert.service';
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
import { ShopifyReconciliationSchedulerService } from './reconciliation/shopify-reconciliation-scheduler.service';
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
import { ShopifyLiveProvider } from './shopify/shopify-live.provider';
import { ShopifyMockProvider } from './shopify/shopify-mock.provider';
import { ShopifyOrderNormalizer } from './shopify/shopify-order-normalizer';
import { ShopifyOrderActionService } from './shopify/shopify-order-action.service';
import { ShopifyOrderSyncService } from './shopify/shopify-order-sync.service';
import { SHOPIFY_PROVIDER } from './shopify/shopify-provider';
import {
  SHOPIFY_LIVE_PROVIDER,
  SHOPIFY_MOCK_PROVIDER,
  ShopifyProviderRouter,
} from './shopify/shopify-provider-router';
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
import { WhatsAppInboxController } from './whatsapp/whatsapp-inbox.controller';
import { WhatsAppInboxService } from './whatsapp/whatsapp-inbox.service';
import { WhatsAppAssignmentService } from './whatsapp/whatsapp-assignment.service';
import { WhatsAppRetentionPurgeService } from './whatsapp/whatsapp-retention-purge.service';

@Module({
  controllers: [
    AuthController,
    DlqOperationsController,
    FinanceOverviewController,
    HealthController,
    IdentityAdministrationController,
    MetricsController,
    OperationalAlertController,
    OperationalDetailController,
    OperationalExportController,
    OperationalQueueController,
    OperationalSearchController,
    ShopifyIntegrationController,
    ShopifyWebhookController,
    ShopifyReconciliationController,
    TransportRateController,
    PaymentIntentController,
    WompiWebhookController,
    WhatsAppIntegrationController,
    WhatsAppMessageController,
    WhatsAppInboundController,
    WhatsAppInboxController,
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
    FinanceOverviewService,
    RequestContextService,
    AppLoggerService,
    AlertingService,
    MetricsService,
    OperationalAlertEvaluatorService,
    OperationalAlertSchedulerService,
    OperationalAlertService,
    OperationalDetailService,
    OperationalExportService,
    OperationalQueueService,
    OperationalSearchService,
    OperationalSummaryService,
    OrderClassifier,
    OrderClassificationService,
    RequestObservabilityMiddleware,
    TracingService,
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
    ShopifyOrderActionService,
    ShopifyOrderSyncService,
    ShopifyReconciliationService,
    ShopifyReconciliationSchedulerService,
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
    WhatsAppAssignmentService,
    WhatsAppInboxService,
    WhatsAppRetentionPurgeService,
    WhatsAppStatusService,
    WhatsAppTemplateService,
    WhatsAppMockProvider,
    WompiMockProvider,
    ShopifyMockProvider,
    ShopifyLiveProvider,
    ShopifyProviderRouter,
    { provide: WOMPI_PROVIDER, useExisting: WompiMockProvider },
    { provide: SHOPIFY_LIVE_PROVIDER, useExisting: ShopifyLiveProvider },
    { provide: SHOPIFY_MOCK_PROVIDER, useExisting: ShopifyMockProvider },
    { provide: SHOPIFY_PROVIDER, useExisting: ShopifyProviderRouter },
    { provide: WHATSAPP_PROVIDER, useExisting: WhatsAppMockProvider },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
