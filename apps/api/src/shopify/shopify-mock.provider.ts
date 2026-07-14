import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/shopify-connection.v1.json';
import orderFixture from './fixtures/shopify-orders-create.v1.json';
import type {
  ShopifyConnectionProbe,
  ShopifyConnectionResult,
  ShopifyOrderQuery,
  ShopifyOrderListQuery,
  ShopifyOrderListResult,
  ShopifyProvider,
} from './shopify-provider';

@Injectable()
export class ShopifyMockProvider implements ShopifyProvider {
  public async fetchOrder(query: ShopifyOrderQuery): Promise<unknown> {
    if (fixture.invalidTokens.includes(query.accessToken)) {
      throw new Error('Simulated Shopify credentials are invalid');
    }
    if (String(orderFixture.id) !== query.orderId) {
      throw new Error('Synthetic Shopify order fixture was not found');
    }
    return Promise.resolve(structuredClone(orderFixture));
  }

  public async listOrders(query: ShopifyOrderListQuery): Promise<ShopifyOrderListResult> {
    if (fixture.invalidTokens.includes(query.accessToken)) {
      throw new Error('Simulated Shopify credentials are invalid');
    }
    if (query.cursor !== undefined) {
      throw new Error('Synthetic Shopify reconciliation cursor is invalid');
    }
    const updatedAt = new Date(orderFixture.updated_at);
    const inWindow = updatedAt >= query.updatedAfter && updatedAt < query.updatedBefore;
    return Promise.resolve({
      fixtureVersion: orderFixture._fixture.version,
      nextCursor: null,
      orders: inWindow ? [{ id: String(orderFixture.id), updatedAt }] : [],
    });
  }

  public async testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult> {
    const identifier = createHash('sha256').update(probe.shopDomain).digest('hex').slice(0, 16);
    const shopLabel = probe.shopDomain.slice(0, -'.myshopify.com'.length);
    return Promise.resolve({
      currency: fixture.currency,
      fixtureVersion: fixture.version,
      healthy: !fixture.invalidTokens.includes(probe.accessToken),
      mode: 'simulation',
      providerShopId: `mock-shop-${identifier}`,
      shopName: `${shopLabel} (simulated)`,
      timezone: fixture.timezone,
    });
  }
}
