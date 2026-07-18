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
  ShopifyOrderActionCommand,
  ShopifyOrderActionResult,
  ShopifyProvider,
  ShopifyWebhookRegistration,
  ShopifyWebhookRegistrationResult,
} from './shopify-provider';

const LOAD_ORDER_ID_PATTERN = /^900000000([0-9]{4})$/u;
const LOAD_ORDER_MAXIMUM = 500;

const createLoadOrderFixture = (orderId: string): unknown => {
  const match = LOAD_ORDER_ID_PATTERN.exec(orderId);
  const index = Number(match?.[1] ?? 0);
  if (!Number.isInteger(index) || index < 1 || index > LOAD_ORDER_MAXIMUM) {
    return null;
  }

  const loadFixture = structuredClone(orderFixture);
  const suffix = String(index).padStart(4, '0');
  loadFixture.id = Number(orderId);
  loadFixture.checkout_id = 9_100_000_000_000 + index;
  loadFixture.customer.id = 9_200_000_000_000 + index;
  loadFixture.customer.email = `load-${suffix}@example.test`;
  const lineItem = loadFixture.line_items[0];
  if (lineItem === undefined) throw new Error('Synthetic Shopify load fixture has no line item');
  lineItem.id = 9_400_000_000_000 + index;
  lineItem.product_id = 9_500_000_000_000 + index;
  lineItem.variant_id = 9_600_000_000_000 + index;
  loadFixture.name = `#LOAD-${suffix}`;
  loadFixture.shipping_address.id = 9_300_000_000_000 + index;
  return loadFixture;
};

@Injectable()
export class ShopifyMockProvider implements ShopifyProvider {
  public applyOrderAction(command: ShopifyOrderActionCommand): Promise<ShopifyOrderActionResult> {
    if (fixture.invalidTokens.includes(command.accessToken)) {
      throw new Error('Simulated Shopify credentials are invalid');
    }
    return Promise.resolve({
      alreadyApplied: false,
      mode: 'simulation',
      remoteJobId: command.action === 'cancel' ? `mock-cancel-${command.orderId}` : null,
    });
  }

  public ensureOrdersCreateWebhook(
    registration: ShopifyWebhookRegistration,
  ): Promise<ShopifyWebhookRegistrationResult> {
    const identifier = createHash('sha256')
      .update(`${registration.shopDomain}:${registration.callbackUrl}`)
      .digest('hex')
      .slice(0, 16);
    return Promise.resolve({
      created: false,
      mode: 'simulation',
      subscriptionId: `mock-webhook-${identifier}`,
    });
  }

  public async fetchOrder(query: ShopifyOrderQuery): Promise<unknown> {
    if (fixture.invalidTokens.includes(query.accessToken)) {
      throw new Error('Simulated Shopify credentials are invalid');
    }
    if (String(orderFixture.id) === query.orderId) {
      return Promise.resolve(structuredClone(orderFixture));
    }
    const loadFixture = createLoadOrderFixture(query.orderId);
    if (loadFixture === null) {
      throw new Error('Synthetic Shopify order fixture was not found');
    }
    return Promise.resolve(loadFixture);
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
      mode: 'simulation',
      nextCursor: null,
      orders: inWindow ? [{ id: String(orderFixture.id), updatedAt }] : [],
      sourceVersion: orderFixture._fixture.version,
    });
  }

  public async testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult> {
    const identifier = createHash('sha256').update(probe.shopDomain).digest('hex').slice(0, 16);
    const shopLabel = probe.shopDomain.slice(0, -'.myshopify.com'.length);
    return Promise.resolve({
      capabilities: { inventory: true, locations: true, orders: true },
      currency: fixture.currency,
      healthy: !fixture.invalidTokens.includes(probe.accessToken),
      mode: 'simulation',
      providerShopId: `mock-shop-${identifier}`,
      shopName: `${shopLabel} (simulated)`,
      sourceVersion: fixture.version,
      timezone: fixture.timezone,
    });
  }
}
