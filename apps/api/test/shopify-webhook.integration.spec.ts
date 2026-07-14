import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/app.factory';
import { PASSWORD_PARAMETERS, PasswordService } from '../src/auth/password.service';
import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { MetricsService } from '../src/observability/metrics.service';
import { OrderClassificationService } from '../src/orders/order-classification.service';
import { OutboxPublisherService } from '../src/outbox/outbox-publisher.service';
import { OutboxQueueService } from '../src/outbox/outbox-queue.service';
import { OutboxWorkerService } from '../src/outbox/outbox-worker.service';
import { createShopifyWebhookHmac } from '../src/shopify/shopify-webhook-signature';
import { ShopifyOrderSyncService } from '../src/shopify/shopify-order-sync.service';

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
const databaseName = `ecommerce_shopify_webhook_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const fixture = readFileSync(
  resolve(process.cwd(), 'src/shopify/fixtures/shopify-orders-create.v1.json'),
);
const password = 'Correct-password-123';
const accessToken = 'mock-valid-token-for-webhook-suite';
const webhookSecret = 'synthetic-webhook-secret-value-1234567890';
const queueSuffix = randomUUID().replaceAll('-', '');
const environmentNames = [
  'OUTBOX_DLQ_NAME',
  'OUTBOX_KILL_SWITCH',
  'OUTBOX_MAX_ATTEMPTS',
  'OUTBOX_PUBLISHER_ENABLED',
  'OUTBOX_QUEUE_NAME',
  'OUTBOX_SIMULATION_MODE',
  'ORDER_CLASSIFICATION_ENABLED',
  'ORDER_CLASSIFICATION_KILL_SWITCH',
  'ORDER_CLASSIFICATION_SIMULATION_MODE',
  'POSTGRES_DB',
  'SHOPIFY_CREDENTIAL_KEYS_JSON',
  'SHOPIFY_CREDENTIAL_KEY_VERSION',
  'SHOPIFY_INTEGRATIONS_ENABLED',
  'SHOPIFY_INTEGRATIONS_KILL_SWITCH',
  'SHOPIFY_ORDER_SYNC_ENABLED',
  'SHOPIFY_ORDER_SYNC_KILL_SWITCH',
  'SHOPIFY_ORDER_SYNC_SIMULATION_MODE',
  'SHOPIFY_SIMULATION_MODE',
  'SHOPIFY_WEBHOOKS_ENABLED',
  'SHOPIFY_WEBHOOKS_KILL_SWITCH',
  'SHOPIFY_WEBHOOKS_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

interface Tokens {
  readonly accessToken: string;
}

interface StoreResponse {
  readonly storeId: string;
}

interface WebhookResponse {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly mode: string;
}

describe('Shopify orders/create webhook ingress in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let prisma: PrismaClient;
  let runtimePrisma: PrismaService;
  let orderSync: ShopifyOrderSyncService;
  let orderClassification: OrderClassificationService;
  let storeId: string;

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
      OUTBOX_DLQ_NAME: `shopify-webhook-dlq-${queueSuffix}`,
      OUTBOX_KILL_SWITCH: 'true',
      OUTBOX_MAX_ATTEMPTS: '3',
      OUTBOX_PUBLISHER_ENABLED: 'false',
      OUTBOX_QUEUE_NAME: `shopify-webhook-${queueSuffix}`,
      OUTBOX_SIMULATION_MODE: 'true',
      ORDER_CLASSIFICATION_ENABLED: 'true',
      ORDER_CLASSIFICATION_KILL_SWITCH: 'false',
      ORDER_CLASSIFICATION_SIMULATION_MODE: 'true',
      POSTGRES_DB: databaseName,
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({
        v1: randomBytes(32).toString('base64url'),
      }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v1',
      SHOPIFY_INTEGRATIONS_ENABLED: 'true',
      SHOPIFY_INTEGRATIONS_KILL_SWITCH: 'false',
      SHOPIFY_ORDER_SYNC_ENABLED: 'true',
      SHOPIFY_ORDER_SYNC_KILL_SWITCH: 'false',
      SHOPIFY_ORDER_SYNC_SIMULATION_MODE: 'true',
      SHOPIFY_SIMULATION_MODE: 'true',
      SHOPIFY_WEBHOOKS_ENABLED: 'true',
      SHOPIFY_WEBHOOKS_KILL_SWITCH: 'false',
      SHOPIFY_WEBHOOKS_SIMULATION_MODE: 'true',
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const organization = await prisma.organization.create({ data: { name: 'Webhook tenant' } });
    organizationId = organization.id;
    const passwordHash = await new PasswordService().hash(password);
    await prisma.user.create({
      data: {
        email: 'webhook-owner@example.test',
        memberships: { create: { organizationId, role: 'OWNER' } },
        passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
        passwordHash,
        passwordParametersJson: PASSWORD_PARAMETERS,
      },
    });

    app = await createApplication();
    runtimePrisma = app.get(PrismaService);
    orderSync = app.get(ShopifyOrderSyncService);
    orderClassification = app.get(OrderClassificationService);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const owner = await login();
    const registered = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `register-${randomUUID()}`)
      .send({
        accessToken,
        currency: 'COP',
        displayName: 'Synthetic webhook connection',
        name: 'Synthetic Webhook Store',
        shopDomain: 'webhook-fixture.myshopify.com',
        timezone: 'America/Bogota',
      })
      .expect(201);
    storeId = (registered.body as StoreResponse).storeId;
    await request(baseUrl)
      .patch(
        `/integrations/organizations/${organizationId}/shopify/stores/${storeId}/webhook-secret`,
      )
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `secret-${randomUUID()}`)
      .send({ webhookSecret })
      .expect(200);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/test`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `test-${randomUUID()}`)
      .expect(200);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `activate-${randomUUID()}`)
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
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

  const login = async (): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email: 'webhook-owner@example.test', organizationId, password })
      .expect(200);
    return response.body as Tokens;
  };

  const deliver = (
    rawBody: Buffer,
    webhookId: string,
    overrides: Readonly<Record<string, string>> = {},
  ) =>
    request(baseUrl)
      .post(`/webhooks/shopify/${storeId}/orders-create`)
      .set('content-type', 'application/json')
      .set('x-shopify-api-version', '2026-07')
      .set('x-shopify-hmac-sha256', createShopifyWebhookHmac(rawBody, webhookSecret))
      .set('x-shopify-shop-domain', 'webhook-fixture.myshopify.com')
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-triggered-at', '2026-07-14T17:00:00.000Z')
      .set('x-shopify-webhook-id', webhookId)
      .set(overrides)
      .send(rawBody.toString('utf8'));

  it('configures the secret encrypted and stores webhook plus outbox exactly once under concurrency', async () => {
    const connection = await prisma.integrationConnection.findFirstOrThrow({ where: { storeId } });
    expect(connection.encryptedWebhookSecretJson).toMatchObject({ version: 'v1' });
    expect(JSON.stringify(connection)).not.toContain(webhookSecret);

    const webhookId = randomUUID();
    const responses = await Promise.all([deliver(fixture, webhookId), deliver(fixture, webhookId)]);
    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
    const bodies = responses.map(({ body }) => body as WebhookResponse);
    expect(bodies.map(({ duplicate }) => duplicate).sort()).toEqual([false, true]);
    expect(bodies[0]?.eventId).toBe(bodies[1]?.eventId);
    expect(bodies[0]).toMatchObject({ accepted: true, mode: 'simulation' });
    expect(
      await prisma.webhookEvent.count({
        where: { eventType: 'orders/create', externalEventId: webhookId, storeId },
      }),
    ).toBe(1);
    const event = await prisma.webhookEvent.findFirstOrThrow({
      where: { externalEventId: webhookId },
    });
    expect(event).toMatchObject({ provider: 'SHOPIFY', signatureValid: true, status: 'RECEIVED' });
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(event)).not.toContain('webhook-fixture.myshopify.com');
    expect(await prisma.outboxEvent.count({ where: { aggregateId: event.id } })).toBe(1);
  });

  it('rejects invalid signatures, altered bodies, unsupported topics and foreign domains', async () => {
    const invalidSignature = await deliver(fixture, randomUUID(), {
      'x-shopify-hmac-sha256': Buffer.alloc(32).toString('base64'),
    });
    expect(invalidSignature.status).toBe(401);

    const invalidJson = Buffer.from('{"invalid"', 'utf8');
    expect(
      (
        await deliver(invalidJson, randomUUID(), {
          'x-shopify-hmac-sha256': Buffer.alloc(32).toString('base64'),
        })
      ).status,
    ).toBe(401);
    expect((await deliver(invalidJson, randomUUID())).status).toBe(400);

    const altered = Buffer.from(fixture.toString('utf8').replace('10000.00', '99999.00'), 'utf8');
    const alteredResponse = await request(baseUrl)
      .post(`/webhooks/shopify/${storeId}/orders-create`)
      .set('content-type', 'application/json')
      .set('x-shopify-api-version', '2026-07')
      .set('x-shopify-hmac-sha256', createShopifyWebhookHmac(fixture, webhookSecret))
      .set('x-shopify-shop-domain', 'webhook-fixture.myshopify.com')
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-triggered-at', '2026-07-14T17:00:00.000Z')
      .set('x-shopify-webhook-id', randomUUID())
      .send(altered.toString('utf8'));
    expect(alteredResponse.status).toBe(401);

    expect(
      (await deliver(fixture, randomUUID(), { 'x-shopify-topic': 'orders/updated' })).status,
    ).toBe(400);
    expect(
      (await deliver(fixture, randomUUID(), { 'x-shopify-shop-domain': 'foreign.myshopify.com' }))
        .status,
    ).toBe(401);
    const oversized = await deliver(Buffer.alloc(262_145, 0x61), randomUUID());
    expect(oversized.status).toBe(413);
    expect(oversized.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/u);
  });

  it('rejects a delivery ID reused with a different signed payload', async () => {
    const webhookId = randomUUID();
    await deliver(fixture, webhookId).expect(202);
    const parsed = JSON.parse(fixture.toString('utf8')) as Record<string, unknown>;
    parsed.name = '#SIM-CONFLICT';
    const conflicting = Buffer.from(JSON.stringify(parsed), 'utf8');
    await deliver(conflicting, webhookId).expect(409);
    expect(await prisma.webhookEvent.count({ where: { externalEventId: webhookId } })).toBe(1);
  });

  it('persists before Redis, survives queue failure and completes after recovery', async () => {
    const webhookId = randomUUID();
    const accepted = await deliver(fixture, webhookId).expect(202);
    const eventId = (accepted.body as WebhookResponse).eventId;
    const targetOutbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: eventId },
    });
    await prisma.outboxEvent.updateMany({
      data: { publishedAt: new Date(), status: 'PUBLISHED' },
      where: { id: { not: targetOutbox.id }, status: 'PENDING' },
    });
    await prisma.outboxEvent.update({
      data: { availableAt: new Date(0), status: 'PENDING' },
      where: { id: targetOutbox.id },
    });

    const realRedisPort = process.env.REDIS_PORT;
    process.env.OUTBOX_KILL_SWITCH = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'true';
    process.env.REDIS_PORT = '6399';
    const unavailableEnvironment = new EnvironmentService();
    const unavailableQueue = new OutboxQueueService(unavailableEnvironment);
    const unavailablePublisher = new OutboxPublisherService(
      unavailableEnvironment,
      new MetricsService(),
      runtimePrisma,
      unavailableQueue,
    );
    expect(unavailableEnvironment.outbox.killSwitch).toBe(false);
    const failedBatchSize = await unavailablePublisher.publishBatch();
    expect(failedBatchSize).toBeGreaterThan(0);
    await unavailableQueue.onModuleDestroy();
    await expect(
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } }),
    ).resolves.toMatchObject({ status: 'RECEIVED' });
    await expect(
      prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: eventId } }),
    ).resolves.toMatchObject({ status: 'FAILED' });
    await prisma.outboxEvent.update({
      data: { availableAt: new Date(0) },
      where: { id: targetOutbox.id },
    });

    if (realRedisPort === undefined) delete process.env.REDIS_PORT;
    else process.env.REDIS_PORT = realRedisPort;
    const recoveredEnvironment = new EnvironmentService();
    const recoveredQueue = new OutboxQueueService(recoveredEnvironment);
    const recoveredPublisher = new OutboxPublisherService(
      recoveredEnvironment,
      new MetricsService(),
      runtimePrisma,
      recoveredQueue,
    );
    const worker = new OutboxWorkerService(
      recoveredEnvironment,
      runtimePrisma,
      orderSync,
      orderClassification,
    );
    worker.onModuleInit();
    expect(await recoveredPublisher.publishBatch()).toBe(1);
    await waitFor(async () => {
      const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
      return event.status === 'PROCESSED';
    });
    await expect(
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } }),
    ).resolves.toMatchObject({ attemptCount: 1, status: 'PROCESSED' });
    const synchronizedOrder = await prisma.order.findFirstOrThrow({
      include: { customer: true, items: true, shippingAddress: true },
      where: { sourceWebhookEventId: eventId },
    });
    expect(synchronizedOrder).toMatchObject({ totalAmount: 1_000_000n });
    expect(synchronizedOrder.customer).not.toBeNull();
    expect(synchronizedOrder.shippingAddress).not.toBeNull();
    expect(synchronizedOrder.items).toHaveLength(1);
    const classificationOutbox = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregateId: synchronizedOrder.id,
        eventType: 'shopify.order.synchronized.v1',
        status: 'PENDING',
      },
    });
    await prisma.outboxEvent.update({
      data: { availableAt: new Date(0) },
      where: { id: classificationOutbox.id },
    });
    expect(await recoveredPublisher.publishBatch()).toBe(1);
    await waitFor(async () => {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: synchronizedOrder.id } });
      return order.currentState === 'READY_FOR_LOGISTICS';
    });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: synchronizedOrder.id } }),
    ).resolves.toMatchObject({ currentState: 'READY_FOR_LOGISTICS', paymentMode: 'PREPAID' });
    await expect(
      prisma.orderStateHistory.count({ where: { orderId: synchronizedOrder.id } }),
    ).resolves.toBe(3);
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_shopify_webhooks_total');
    expect(metrics.text).toContain('ecommerce_api_shopify_order_sync_total');
    expect(metrics.text).toContain('ecommerce_api_order_classifications_total');
    await worker.onModuleDestroy();
    await recoveredQueue.onModuleDestroy();
    const persisted = JSON.stringify(
      await prisma.auditLog.findMany({ where: { action: { startsWith: 'shopify.webhook.' } } }),
    );
    expect(persisted).not.toContain(webhookSecret);
    expect(persisted).not.toContain('x-shopify-hmac');
    expect(persisted).not.toContain('webhook-fixture.myshopify.com');
  });

  it('dead-letters a verified webhook when the provider resource cannot be synchronized', async () => {
    const accepted = await deliver(fixture, randomUUID()).expect(202);
    const eventId = (accepted.body as WebhookResponse).eventId;
    await prisma.webhookEvent.update({
      data: { providerResourceId: 'missing-synthetic-order' },
      where: { id: eventId },
    });
    const targetOutbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: eventId, eventType: 'shopify.webhook.received.v1' },
    });
    await prisma.outboxEvent.updateMany({
      data: { publishedAt: new Date(), status: 'PUBLISHED' },
      where: { id: { not: targetOutbox.id }, status: { in: ['FAILED', 'PENDING'] } },
    });
    await prisma.outboxEvent.update({
      data: { availableAt: new Date(0), status: 'PENDING' },
      where: { id: targetOutbox.id },
    });
    process.env.OUTBOX_KILL_SWITCH = 'false';
    process.env.OUTBOX_MAX_ATTEMPTS = '1';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'true';
    const failureEnvironment = new EnvironmentService();
    const queue = new OutboxQueueService(failureEnvironment);
    const publisher = new OutboxPublisherService(
      failureEnvironment,
      new MetricsService(),
      runtimePrisma,
      queue,
    );
    const worker = new OutboxWorkerService(failureEnvironment, runtimePrisma, orderSync);
    worker.onModuleInit();
    expect(await publisher.publishBatch()).toBe(1);
    await waitFor(async () => {
      const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
      return event.status === 'DEAD_LETTER';
    });
    await worker.onModuleDestroy();
    await queue.onModuleDestroy();
    await expect(
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: targetOutbox.id } }),
    ).resolves.toMatchObject({ status: 'DEAD_LETTER' });
    await expect(prisma.order.count({ where: { sourceWebhookEventId: eventId } })).resolves.toBe(0);
    process.env.OUTBOX_KILL_SWITCH = 'true';
    process.env.OUTBOX_MAX_ATTEMPTS = '3';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
  });
});

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('Timed out waiting for Shopify webhook processing');
}
