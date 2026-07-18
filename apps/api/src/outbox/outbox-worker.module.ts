import { Module } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OrderClassificationService } from '../orders/order-classification.service';
import { OrderClassifier } from '../orders/order-classifier';
import { ShopifyCredentialCipher } from '../shopify/shopify-credential-cipher';
import { ShopifyLiveProvider } from '../shopify/shopify-live.provider';
import { ShopifyMockProvider } from '../shopify/shopify-mock.provider';
import { ShopifyOrderNormalizer } from '../shopify/shopify-order-normalizer';
import { ShopifyOrderActionService } from '../shopify/shopify-order-action.service';
import { ShopifyOrderSyncService } from '../shopify/shopify-order-sync.service';
import { SHOPIFY_PROVIDER } from '../shopify/shopify-provider';
import {
  SHOPIFY_LIVE_PROVIDER,
  SHOPIFY_MOCK_PROVIDER,
  ShopifyProviderRouter,
} from '../shopify/shopify-provider-router';
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
    ShopifyLiveProvider,
    ShopifyProviderRouter,
    ShopifyOrderNormalizer,
    ShopifyOrderActionService,
    ShopifyOrderSyncService,
    { provide: SHOPIFY_LIVE_PROVIDER, useExisting: ShopifyLiveProvider },
    { provide: SHOPIFY_MOCK_PROVIDER, useExisting: ShopifyMockProvider },
    { provide: SHOPIFY_PROVIDER, useExisting: ShopifyProviderRouter },
    OutboxWorkerService,
  ],
})
export class OutboxWorkerModule {}
