import { Inject, Injectable } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { ShopifyLiveProvider } from './shopify-live.provider';
import { ShopifyMockProvider } from './shopify-mock.provider';
import type {
  ShopifyConnectionProbe,
  ShopifyConnectionResult,
  ShopifyOrderListQuery,
  ShopifyOrderListResult,
  ShopifyOrderActionCommand,
  ShopifyOrderActionResult,
  ShopifyOrderQuery,
  ShopifyProvider,
  ShopifyWebhookRegistration,
  ShopifyWebhookRegistrationResult,
} from './shopify-provider';

export const SHOPIFY_LIVE_PROVIDER = Symbol('SHOPIFY_LIVE_PROVIDER');
export const SHOPIFY_MOCK_PROVIDER = Symbol('SHOPIFY_MOCK_PROVIDER');

@Injectable()
export class ShopifyProviderRouter implements ShopifyProvider {
  public constructor(
    private readonly environment: EnvironmentService,
    @Inject(SHOPIFY_LIVE_PROVIDER) private readonly live: ShopifyLiveProvider,
    @Inject(SHOPIFY_MOCK_PROVIDER) private readonly mock: ShopifyMockProvider,
  ) {}

  public applyOrderAction(command: ShopifyOrderActionCommand): Promise<ShopifyOrderActionResult> {
    return this.selected.applyOrderAction(command);
  }

  public ensureOrdersCreateWebhook(
    registration: ShopifyWebhookRegistration,
  ): Promise<ShopifyWebhookRegistrationResult> {
    return this.selected.ensureOrdersCreateWebhook(registration);
  }

  public fetchOrder(query: ShopifyOrderQuery): Promise<unknown> {
    return this.selected.fetchOrder(query);
  }

  public listOrders(query: ShopifyOrderListQuery): Promise<ShopifyOrderListResult> {
    return this.selected.listOrders(query);
  }

  public testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult> {
    return this.selected.testConnection(probe);
  }

  private get selected(): ShopifyProvider {
    return this.environment.shopify.simulationMode ? this.mock : this.live;
  }
}
