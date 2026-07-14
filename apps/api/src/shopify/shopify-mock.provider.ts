import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/shopify-connection.v1.json';
import type {
  ShopifyConnectionProbe,
  ShopifyConnectionResult,
  ShopifyProvider,
} from './shopify-provider';

@Injectable()
export class ShopifyMockProvider implements ShopifyProvider {
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
