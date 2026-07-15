import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/app.factory';
import { PASSWORD_PARAMETERS, PasswordService } from '../src/auth/password.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaClient } from '../src/generated/prisma/client';

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
const databaseName = `ecommerce_transport_rates_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'POSTGRES_DB',
  'TRANSPORT_RATES_ENABLED',
  'TRANSPORT_RATES_KILL_SWITCH',
  'TRANSPORT_RATES_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);
const password = 'Correct-password-123';

interface Tokens {
  readonly accessToken: string;
}

describe('transport rate policies in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let globalPolicyId: string;
  let operationsToken: string;
  let orderId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerToken: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
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
      POSTGRES_DB: databaseName,
      TRANSPORT_RATES_ENABLED: 'true',
      TRANSPORT_RATES_KILL_SWITCH: 'false',
      TRANSPORT_RATES_SIMULATION_MODE: 'true',
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const organization = await prisma.organization.create({ data: { name: 'Rate tenant' } });
    organizationId = organization.id;
    otherOrganizationId = (
      await prisma.organization.create({ data: { name: 'Other rate tenant' } })
    ).id;
    const passwordHash = await new PasswordService().hash(password);
    for (const [email, role] of [
      ['rate-owner@example.test', 'OWNER'],
      ['rate-operations@example.test', 'OPERATIONS'],
      ['rate-reader@example.test', 'READ_ONLY'],
    ] as const) {
      await prisma.user.create({
        data: {
          email,
          memberships: { create: { organizationId, role } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      });
    }
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Rate Store',
        organizationId,
        shopifyShopDomain: 'rates.myshopify.com',
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    storeId = store.id;
    orderId = await createCodOrder();
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await login('rate-owner@example.test');
    operationsToken = await login('rate-operations@example.test');
    readOnlyToken = await login('rate-reader@example.test');
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

  const login = async (email: string): Promise<string> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password })
      .expect(200);
    return (response.body as Tokens).accessToken;
  };

  const createCodOrder = async (): Promise<string> => {
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
        providerResourceId: randomUUID(),
        storeId,
        triggeredAt: new Date(),
      },
    });
    const customer = await prisma.customer.create({
      data: { organizationId, shopifyCustomerId: randomUUID(), storeId },
    });
    const address = await prisma.customerAddress.create({
      data: {
        address1: 'Calle sintética 1',
        city: 'Bogotá',
        countryCode: 'CO',
        customerId: customer.id,
        department: 'Cundinamarca',
        normalizedAddress: 'calle sintetica 1 bogota',
        organizationId,
        shopifyAddressId: randomUUID(),
        storeId,
      },
    });
    const order = await prisma.order.create({
      data: {
        currency: 'COP',
        currentState: 'PENDING_TRANSPORT_PAYMENT',
        customerId: customer.id,
        discountAmount: 0n,
        organizationId,
        paymentMode: 'COD',
        rawSnapshotJson: { synthetic: true },
        shippingAddressId: address.id,
        shopifyOrderId: randomUUID(),
        shopifyOrderName: '#RATE-1',
        sourceCreatedAt: new Date(),
        sourceUpdatedAt: new Date(),
        sourceWebhookEventId: webhook.id,
        storeId,
        subtotalAmount: 10_000_000n,
        taxAmount: 0n,
        totalAmount: 10_000_000n,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        organizationId,
        productName: 'Producto sintético',
        quantity: 1,
        shopifyLineItemId: randomUUID(),
        shopifyProductId: 'product-rate-1',
        snapshotJson: { synthetic: true },
        storeId,
        totalPriceAmount: 10_000_000n,
        unitPriceAmount: 10_000_000n,
      },
    });
    return order.id;
  };

  const createPolicy = (
    token: string,
    body: Record<string, unknown>,
    key = `policy-${randomUUID()}`,
  ) =>
    request(baseUrl)
      .post(`/operations/organizations/${organizationId}/transport-rates/policies`)
      .set('authorization', `Bearer ${token}`)
      .set('idempotency-key', key)
      .send(body);

  it('creates one global policy under concurrent replay and enforces management RBAC', async () => {
    const body = {
      currency: 'COP',
      rules: [
        { amountMinor: 1_500_000, priority: 10, ruleKey: 'global-default' },
        { amountMinor: 1_000_000, city: ' Bogotá ', priority: 100, ruleKey: 'bogota' },
      ],
    };
    await createPolicy(readOnlyToken, body).expect(403);
    const key = `global-${randomUUID()}`;
    const responses = await Promise.all([
      createPolicy(ownerToken, body, key),
      createPolicy(ownerToken, body, key),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    globalPolicyId = (responses[0]?.body as { policyId: string }).policyId;
    await expect(
      prisma.transportRatePolicy.count({ where: { organizationId, storeId: null } }),
    ).resolves.toBe(1);
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/transport-rates/policies/${globalPolicyId}/activate`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .set('idempotency-key', `denied-${randomUUID()}`)
      .expect(403);
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/transport-rates/policies/${globalPolicyId}/activate`,
      )
      .set('authorization', `Bearer ${ownerToken}`)
      .set('idempotency-key', `activate-${randomUUID()}`)
      .expect(200);
    const activationEndpoint = `/operations/organizations/${organizationId}/transport-rates/policies/${globalPolicyId}/activate`;
    const repeatedActivations = await Promise.all(
      [1, 2].map(() =>
        request(baseUrl)
          .post(activationEndpoint)
          .set('authorization', `Bearer ${ownerToken}`)
          .set('idempotency-key', `reactivate-${randomUUID()}`),
      ),
    );
    expect(repeatedActivations.map(({ status }) => status)).toEqual([200, 200]);
    await expect(
      prisma.outboxEvent.count({
        where: {
          aggregateId: globalPolicyId,
          eventType: 'transport.rate_policy.activated.v1',
        },
      }),
    ).resolves.toBe(1);
  });

  it('prefers an equally specific store rule and preserves tenant isolation', async () => {
    const policy = await createPolicy(ownerToken, {
      currency: 'COP',
      rules: [
        {
          amountMinor: 2_000_000,
          priority: 100,
          ruleKey: 'store-product',
          shopifyProductId: 'product-rate-1',
        },
      ],
      storeId,
    }).expect(201);
    const policyId = (policy.body as { policyId: string }).policyId;
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/transport-rates/policies/${policyId}/activate`,
      )
      .set('authorization', `Bearer ${ownerToken}`)
      .set('idempotency-key', `activate-${randomUUID()}`)
      .expect(200);
    await request(baseUrl)
      .post(`/operations/organizations/${otherOrganizationId}/transport-rates/preview`)
      .set('authorization', `Bearer ${operationsToken}`)
      .send({ orderId })
      .expect(403);
    await request(baseUrl)
      .post(`/operations/organizations/${organizationId}/transport-rates/preview`)
      .set('authorization', `Bearer ${readOnlyToken}`)
      .send({ orderId })
      .expect(403);
    const preview = await request(baseUrl)
      .post(`/operations/organizations/${organizationId}/transport-rates/preview`)
      .set('authorization', `Bearer ${operationsToken}`)
      .send({ orderId })
      .expect(200);
    expect(preview.body).toMatchObject({
      amountMinor: 2_000_000,
      outcome: 'previewed',
      policyScope: 'store',
      ruleKey: 'store-product',
    });
  });

  it('resolves once under concurrent replay and emits one durable decision/outbox', async () => {
    const endpoint = `/operations/organizations/${organizationId}/transport-rates/orders/${orderId}/resolve`;
    const key = `resolve-${randomUUID()}`;
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(baseUrl)
          .post(endpoint)
          .set('authorization', `Bearer ${operationsToken}`)
          .set('idempotency-key', key),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[0]?.body).toMatchObject({ amountMinor: 2_000_000, ruleKey: 'store-product' });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: orderId } })).resolves.toMatchObject(
      {
        transportChargeAmount: 2_000_000n,
      },
    );
    await expect(prisma.transportRateDecision.count({ where: { orderId } })).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: orderId, eventType: 'order.transport_rate.resolved.v1' },
      }),
    ).resolves.toBe(1);
    const replay = await request(baseUrl)
      .post(endpoint)
      .set('authorization', `Bearer ${operationsToken}`)
      .set('idempotency-key', `resolve-again-${randomUUID()}`)
      .expect(200);
    expect(replay.body).toMatchObject({ outcome: 'replayed' });
  });
});
