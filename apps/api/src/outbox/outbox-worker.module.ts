import { Module } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OrderClassificationService } from '../orders/order-classification.service';
import { OrderClassifier } from '../orders/order-classifier';
import { ShopifyCredentialCipher } from '../shopify/shopify-credential-cipher';
import { ShopifyMockProvider } from '../shopify/shopify-mock.provider';
import { ShopifyOrderNormalizer } from '../shopify/shopify-order-normalizer';
import { ShopifyOrderSyncService } from '../shopify/shopify-order-sync.service';
import { SHOPIFY_PROVIDER } from '../shopify/shopify-provider';
import { OutboxWorkerService } from './outbox-worker.service';

@Module({
  providers: [
    EnvironmentService,
    PrismaService,
    MetricsService,
    OrderClassifier,
    OrderClassificationService,
    ShopifyCredentialCipher,
    ShopifyMockProvider,
    ShopifyOrderNormalizer,
    ShopifyOrderSyncService,
    { provide: SHOPIFY_PROVIDER, useExisting: ShopifyMockProvider },
    OutboxWorkerService,
  ],
})
export class OutboxWorkerModule {}
