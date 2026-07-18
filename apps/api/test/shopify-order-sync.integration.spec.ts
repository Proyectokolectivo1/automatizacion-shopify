import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaService } from '../src/database/prisma.service';
import { MetricsService } from '../src/observability/metrics.service';
import { ShopifyCredentialCipher } from '../src/shopify/shopify-credential-cipher';
import orderFixture from '../src/shopify/fixtures/shopify-orders-create.v1.json';
import { ShopifyOrderNormalizer } from '../src/shopify/shopify-order-normalizer';
import { ShopifyOrderSyncService } from '../src/shopify/shopify-order-sync.service';
import type {
  ShopifyConnectionResult,
  ShopifyOrderActionResult,
  ShopifyOrderListResult,
  ShopifyOrderQuery,
  ShopifyProvider,
  ShopifyWebhookRegistrationResult,
} from '../src/shopify/shopify-provider';

loadEnvironmentFiles();

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') throw new Error(`Missing test setting: ${name}`);
  return value;
};
const adminConfig = {
  database: required('POSTGRES_DB'),
  host: required('POSTGRES_HOST'),
  password: required('POSTGRES_PASSWORD'),
  port: Number(required('POSTGRES_PORT')),
  user: required('POSTGRES_USER'),
};
const originalDatabase = adminConfig.database;
const databaseName = `ecommerce_shopify_order_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'POSTGRES_DB',
  'SHOPIFY_CREDENTIAL_KEYS_JSON',
  'SHOPIFY_CREDENTIAL_KEY_VERSION',
  'SHOPIFY_ORDER_SYNC_ENABLED',
  'SHOPIFY_ORDER_SYNC_KILL_SWITCH',
  'SHOPIFY_ORDER_SYNC_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

class MutableShopifyProvider implements ShopifyProvider {
  public payload: Record<string, unknown> = structuredClone(orderFixture);

  public applyOrderAction(): Promise<ShopifyOrderActionResult> {
    return Promise.resolve({
      alreadyApplied: false,
      mode: 'simulation',
      remoteJobId: null,
    });
  }

  public ensureOrdersCreateWebhook(): Promise<ShopifyWebhookRegistrationResult> {
    return Promise.resolve({
      created: false,
      mode: 'simulation',
      subscriptionId: 'test-webhook',
    });
  }

  public fetchOrder(query: ShopifyOrderQuery): Promise<unknown> {
    if (String(this.payload.id) !== query.orderId) throw new Error('Synthetic order not found');
    return Promise.resolve(structuredClone(this.payload));
  }

  public listOrders(): Promise<ShopifyOrderListResult> {
    return Promise.resolve({
      mode: 'simulation',
      nextCursor: null,
      orders: [],
      sourceVersion: 'v1',
    });
  }

  public testConnection(): Promise<ShopifyConnectionResult> {
    return Promise.resolve({
      capabilities: { inventory: true, locations: true, orders: true },
      currency: 'COP',
      healthy: true,
      mode: 'simulation',
      providerShopId: 'test-shop',
      shopName: 'Test shop',
      sourceVersion: 'v1',
      timezone: 'America/Bogota',
    });
  }
}

describe('Shopify normalized order synchronization in simulation mode', () => {
  let organizationId: string;
  let storeId: string;
  let prisma: PrismaService;
  let provider: MutableShopifyProvider;
  let service: ShopifyOrderSyncService;

  beforeAll(async () => {
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.end();
    execFileSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );
    Object.assign(process.env, {
      POSTGRES_DB: databaseName,
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({
        v1: randomBytes(32).toString('base64url'),
      }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v1',
      SHOPIFY_ORDER_SYNC_ENABLED: 'true',
      SHOPIFY_ORDER_SYNC_KILL_SWITCH: 'false',
      SHOPIFY_ORDER_SYNC_SIMULATION_MODE: 'true',
    });
    const environment = new EnvironmentService();
    prisma = new PrismaService(environment);
    await prisma.$connect();
    const organization = await prisma.organization.create({ data: { name: 'Order sync tenant' } });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Order Sync Store',
        organizationId,
        shopifyShopDomain: 'order-sync.myshopify.com',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    storeId = store.id;
    const cipher = new ShopifyCredentialCipher(environment);
    await prisma.integrationConnection.create({
      data: {
        displayName: 'Synthetic order provider',
        encryptedCredentialsJson: {
          ...cipher.encrypt('synthetic-access-token', organizationId, storeId),
        },
        organizationId,
        provider: 'SHOPIFY',
        status: 'ACTIVE',
        storeId,
      },
    });
    provider = new MutableShopifyProvider();
    service = new ShopifyOrderSyncService(
      cipher,
      environment,
      new MetricsService(),
      new ShopifyOrderNormalizer(),
      prisma,
      provider,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    process.env.POSTGRES_DB = originalDatabase;
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  });

  const createWebhook = async () =>
    prisma.webhookEvent.create({
      data: {
        apiVersion: '2026-07',
        eventType: 'orders/create',
        externalEventId: randomUUID(),
        headersRedactedJson: {},
        organizationId,
        payloadHash: randomBytes(32).toString('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        providerResourceId: String(provider.payload.id),
        storeId,
        triggeredAt: new Date(),
      },
    });

  it('creates the order aggregate exactly once under concurrent replay', async () => {
    const webhook = await createWebhook();
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((correlationId) =>
        service.syncFromWebhook({ correlationId, organizationId, webhookEventId: webhook.id }),
      ),
    );
    expect(results.map(({ outcome }) => outcome).sort()).toEqual(['created', 'replayed']);
    const order = await prisma.order.findFirstOrThrow({
      include: { customer: true, items: true, shippingAddress: true },
      where: { storeId },
    });
    expect(order).toMatchObject({
      currency: 'COP',
      currentState: 'RECEIVED',
      discountAmount: 0n,
      paymentMode: 'UNCLASSIFIED',
      shopifyOrderId: '1000000000001',
      subtotalAmount: 1_000_000n,
      totalAmount: 1_000_000n,
      version: 1,
    });
    expect(order.customer).toMatchObject({ email: 'cliente.sintetico@example.test' });
    expect(order.shippingAddress).toMatchObject({ countryCode: 'CO' });
    expect(order.items).toHaveLength(1);
    expect(
      await prisma.outboxEvent.count({ where: { eventType: 'shopify.order.synchronized.v1' } }),
    ).toBe(1);
  });

  it('updates a newer snapshot without duplicating customer, address or items', async () => {
    provider.payload = {
      ...structuredClone(orderFixture),
      subtotal_price: '12000.00',
      total_price: '12000.00',
      updated_at: '2026-07-14T13:05:00-05:00',
      line_items: [{ ...structuredClone(orderFixture.line_items[0]), price: '12000.00' }],
    };
    const webhook = await createWebhook();
    await expect(
      service.syncFromWebhook({
        correlationId: randomUUID(),
        organizationId,
        webhookEventId: webhook.id,
      }),
    ).resolves.toMatchObject({ outcome: 'updated' });
    await expect(prisma.order.findFirstOrThrow({ where: { storeId } })).resolves.toMatchObject({
      sourceWebhookEventId: webhook.id,
      totalAmount: 1_200_000n,
      version: 2,
    });
    await expect(prisma.customer.count({ where: { storeId } })).resolves.toBe(1);
    await expect(prisma.customerAddress.count({ where: { storeId } })).resolves.toBe(1);
    await expect(prisma.orderItem.count({ where: { storeId } })).resolves.toBe(1);
  });

  it('ignores a late snapshot and preserves the newer order version', async () => {
    provider.payload = structuredClone(orderFixture);
    const webhook = await createWebhook();
    await expect(
      service.syncFromWebhook({
        correlationId: randomUUID(),
        organizationId,
        webhookEventId: webhook.id,
      }),
    ).resolves.toMatchObject({ outcome: 'ignored_stale' });
    await expect(prisma.order.findFirstOrThrow({ where: { storeId } })).resolves.toMatchObject({
      totalAmount: 1_200_000n,
      version: 2,
    });
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'shopify.order.synchronized.v1' } }),
    ).resolves.toBe(2);
  });

  it('fails closed for an invalid provider contract and a kill switch', async () => {
    provider.payload = { ...structuredClone(orderFixture), test: false };
    const webhook = await createWebhook();
    await expect(
      service.syncFromWebhook({
        correlationId: randomUUID(),
        organizationId,
        webhookEventId: webhook.id,
      }),
    ).rejects.toThrow();
    process.env.SHOPIFY_ORDER_SYNC_KILL_SWITCH = 'true';
    const disabledEnvironment = new EnvironmentService();
    const disabled = new ShopifyOrderSyncService(
      new ShopifyCredentialCipher(disabledEnvironment),
      disabledEnvironment,
      new MetricsService(),
      new ShopifyOrderNormalizer(),
      prisma,
      provider,
    );
    await expect(
      disabled.syncFromWebhook({
        correlationId: randomUUID(),
        organizationId,
        webhookEventId: webhook.id,
      }),
    ).rejects.toThrow('synchronization is disabled');
    process.env.SHOPIFY_ORDER_SYNC_KILL_SWITCH = 'false';
  });
});
