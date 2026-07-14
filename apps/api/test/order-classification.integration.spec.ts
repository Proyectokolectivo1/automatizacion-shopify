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
import { OrderClassificationService } from '../src/orders/order-classification.service';
import { DEFAULT_ORDER_CLASSIFICATION_POLICY } from '../src/orders/order-classification-policy';
import { OrderClassifier } from '../src/orders/order-classifier';

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
const databaseName = `ecommerce_order_classification_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'POSTGRES_DB',
  'ORDER_CLASSIFICATION_ENABLED',
  'ORDER_CLASSIFICATION_KILL_SWITCH',
  'ORDER_CLASSIFICATION_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

describe('configurable order payment classification', () => {
  let organizationId: string;
  let storeId: string;
  let prisma: PrismaService;
  let service: OrderClassificationService;

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
      ORDER_CLASSIFICATION_ENABLED: 'true',
      ORDER_CLASSIFICATION_KILL_SWITCH: 'false',
      ORDER_CLASSIFICATION_SIMULATION_MODE: 'true',
      POSTGRES_DB: databaseName,
    });
    const environment = new EnvironmentService();
    prisma = new PrismaService(environment);
    await prisma.$connect();
    const organization = await prisma.organization.create({
      data: { name: 'Classification tenant' },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Classification Store',
        organizationId,
        shopifyShopDomain: 'classification.myshopify.com',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    storeId = store.id;
    await prisma.orderClassificationPolicy.create({
      data: {
        activatedAt: new Date(),
        active: true,
        organizationId,
        rulesJson: structuredClone(DEFAULT_ORDER_CLASSIFICATION_POLICY),
        storeId,
        version: 1,
      },
    });
    service = new OrderClassificationService(
      new OrderClassifier(),
      environment,
      new MetricsService(),
      prisma,
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

  const createOrder = async (options: {
    readonly financialStatus: string;
    readonly state?: 'RECEIVED' | 'VALIDATING';
    readonly tags?: readonly string[];
  }) => {
    const shopifyOrderId = randomUUID();
    const webhook = await prisma.webhookEvent.create({
      data: {
        apiVersion: '2026-07',
        eventType: 'orders/create',
        externalEventId: randomUUID(),
        headersRedactedJson: {},
        organizationId,
        payloadHash: randomBytes(32).toString('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        providerResourceId: shopifyOrderId,
        storeId,
        triggeredAt: new Date(),
      },
    });
    return prisma.order.create({
      data: {
        currency: 'COP',
        currentState: options.state ?? 'RECEIVED',
        discountAmount: 0n,
        organizationId,
        rawSnapshotJson: {
          financial_status: options.financialStatus,
          payment_gateway_names: ['synthetic_gateway'],
          tags: [...(options.tags ?? [])],
        },
        shopifyOrderId,
        shopifyOrderName: `#${shopifyOrderId.slice(0, 8)}`,
        sourceCreatedAt: new Date(),
        sourceUpdatedAt: new Date(),
        sourceWebhookEventId: webhook.id,
        storeId,
        subtotalAmount: 10_000n,
        taxAmount: 0n,
        totalAmount: 10_000n,
      },
    });
  };

  it('classifies prepaid once under concurrent event replay and records every transition', async () => {
    const order = await createOrder({ financialStatus: 'paid' });
    const eventId = randomUUID();
    const command = { correlationId: randomUUID(), eventId, orderId: order.id, organizationId };
    const results = await Promise.all([service.classify(command), service.classify(command)]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual(['classified', 'replayed']);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({
      currentState: 'READY_FOR_LOGISTICS',
      paymentMode: 'PREPAID',
      version: 2,
    });
    const history = await prisma.orderStateHistory.findMany({
      orderBy: { createdAt: 'asc' },
      where: { orderId: order.id },
    });
    expect(history.map(({ fromState, toState }) => [fromState, toState])).toEqual([
      ['RECEIVED', 'VALIDATING'],
      ['VALIDATING', 'READY_FOR_PAYMENT_CLASSIFICATION'],
      ['READY_FOR_PAYMENT_CLASSIFICATION', 'READY_FOR_LOGISTICS'],
    ]);
    expect(
      history.every(({ metadataJson }) =>
        JSON.stringify(metadataJson).includes(command.correlationId),
      ),
    ).toBe(true);
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: order.id, eventType: 'order.classified.v1' },
      }),
    ).resolves.toBe(1);
  });

  it('routes configurable cash-on-delivery evidence to transport payment', async () => {
    const order = await createOrder({ financialStatus: 'pending', tags: ['contraentrega'] });
    await expect(
      service.classify({
        correlationId: randomUUID(),
        eventId: randomUUID(),
        orderId: order.id,
        organizationId,
      }),
    ).resolves.toMatchObject({
      outcome: 'classified',
      paymentMode: 'COD',
      state: 'PENDING_TRANSPORT_PAYMENT',
    });
  });

  it('fails closed without evidence and rolls back workflow changes', async () => {
    const order = await createOrder({ financialStatus: 'pending' });
    await expect(
      service.classify({
        correlationId: randomUUID(),
        eventId: randomUUID(),
        orderId: order.id,
        organizationId,
      }),
    ).rejects.toMatchObject({ code: 'NO_MATCH' });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({ currentState: 'RECEIVED', paymentMode: 'UNCLASSIFIED', version: 1 });
    await expect(prisma.orderStateHistory.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });

  it('denies an unapproved source state by default', async () => {
    const order = await createOrder({ financialStatus: 'paid', state: 'VALIDATING' });
    await expect(
      service.classify({
        correlationId: randomUUID(),
        eventId: randomUUID(),
        orderId: order.id,
        organizationId,
      }),
    ).rejects.toThrow('transition denied');
    await expect(prisma.orderStateHistory.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });
});
