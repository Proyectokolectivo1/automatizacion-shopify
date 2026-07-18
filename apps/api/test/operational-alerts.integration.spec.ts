import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../src/app.factory';
import { PASSWORD_PARAMETERS, PasswordService } from '../src/auth/password.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaClient } from '../src/generated/prisma/client';
import { OperationalAlertEvaluatorService } from '../src/operations/operational-alert-evaluator.service';
import { OperationalAlertSchedulerService } from '../src/operations/operational-alert-scheduler.service';

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
const databaseName = `ecommerce_alerts_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const password = 'Correct-password-123';
const environmentNames = [
  'OPERATIONAL_ALERTS_BATCH_SIZE',
  'OPERATIONAL_ALERTS_ENABLED',
  'OPERATIONAL_ALERTS_KILL_SWITCH',
  'OPERATIONAL_ALERTS_LOOKBACK_HOURS',
  'OPERATIONAL_ALERTS_POLL_INTERVAL_MS',
  'POSTGRES_DB',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

interface Tokens {
  readonly accessToken: string;
}

interface AlertItem {
  readonly alertId: string;
  readonly observedCount: number;
  readonly rule: { readonly key: string; readonly version: number };
  readonly status: 'open' | 'resolved';
  readonly type: string;
}

interface AlertResponse {
  readonly contractVersion: 'v1';
  readonly items: readonly AlertItem[];
  readonly nextCursor: string | null;
}

interface RulesResponse {
  readonly contractVersion: 'v1';
  readonly rules: readonly { readonly version: number }[];
}

describe('E6-H4A durable operational alerts', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let evaluator: OperationalAlertEvaluatorService;
  let foreignOrganizationId: string;
  let foreignOwnerToken: string;
  let operationsToken: string;
  let organizationId: string;
  let ownerToken: string;
  let paymentIntentId: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
  let scheduler: OperationalAlertSchedulerService;
  let supportToken: string;
  let attentionOrderId: string;

  const endpoint = (targetOrganizationId = organizationId) =>
    `/operations/organizations/${targetOrganizationId}/alerts`;
  const window = {
    from: new Date('2026-07-18T09:00:00.000Z'),
    to: new Date('2026-07-18T12:00:00.000Z'),
  };

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
      OPERATIONAL_ALERTS_BATCH_SIZE: '25',
      OPERATIONAL_ALERTS_ENABLED: 'true',
      OPERATIONAL_ALERTS_KILL_SWITCH: 'false',
      OPERATIONAL_ALERTS_LOOKBACK_HOURS: '24',
      OPERATIONAL_ALERTS_POLL_INTERVAL_MS: '900000',
      POSTGRES_DB: databaseName,
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();

    const [organization, foreignOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'Operational alerts tenant' } }),
      prisma.organization.create({ data: { name: 'Foreign alerts tenant' } }),
    ]);
    organizationId = organization.id;
    foreignOrganizationId = foreignOrganization.id;
    const [store, foreignStore] = await Promise.all([
      prisma.store.create({
        data: {
          currency: 'COP',
          name: 'Alerts store',
          organizationId,
          shopifyShopDomain: `alerts-${randomUUID().slice(0, 8)}.myshopify.com`,
          status: 'ACTIVE',
          timezone: 'America/Bogota',
        },
      }),
      prisma.store.create({
        data: {
          currency: 'COP',
          name: 'Foreign alerts store',
          organizationId: foreignOrganizationId,
          shopifyShopDomain: `foreign-alerts-${randomUUID().slice(0, 8)}.myshopify.com`,
          status: 'ACTIVE',
          timezone: 'America/Bogota',
        },
      }),
    ]);

    const passwordHash = await new PasswordService().hash(password);
    const createUser = (
      email: string,
      role: 'OPERATIONS' | 'OWNER' | 'READ_ONLY' | 'SUPPORT',
      targetOrganizationId = organizationId,
    ) =>
      prisma.user.create({
        data: {
          email,
          memberships: { create: { organizationId: targetOrganizationId, role } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      });
    const [owner, operations, support, reader, foreignOwner] = await Promise.all([
      createUser('alerts-owner@example.test', 'OWNER'),
      createUser('alerts-operations@example.test', 'OPERATIONS'),
      createUser('alerts-support@example.test', 'SUPPORT'),
      createUser('alerts-reader@example.test', 'READ_ONLY'),
      createUser('alerts-foreign@example.test', 'OWNER', foreignOrganizationId),
    ]);

    const createOrder = async (
      targetOrganizationId: string,
      targetStoreId: string,
      suffix: string,
    ) => {
      const webhook = await prisma.webhookEvent.create({
        data: {
          apiVersion: '2026-07',
          eventType: 'orders/create',
          externalEventId: `alerts-${suffix}-${randomUUID()}`,
          headersRedactedJson: {},
          organizationId: targetOrganizationId,
          payloadHash: randomBytes(32).toString('hex'),
          payloadRedactedJson: { email: 'source-pii@example.test' },
          provider: 'SHOPIFY',
          storeId: targetStoreId,
          triggeredAt: new Date('2026-07-18T10:00:00.000Z'),
        },
      });
      return prisma.order.create({
        data: {
          currency: 'COP',
          currentState: 'MANUAL_REVIEW',
          discountAmount: 0,
          organizationId: targetOrganizationId,
          rawSnapshotJson: { phone: '+573001234567' },
          shopifyOrderId: `alerts-order-${suffix}`,
          shopifyOrderName: `#ALERT-${suffix}`,
          sourceCreatedAt: new Date('2026-07-18T10:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-07-18T10:00:00.000Z'),
          sourceWebhookEventId: webhook.id,
          storeId: targetStoreId,
          subtotalAmount: 10_000,
          taxAmount: 0,
          totalAmount: 10_000,
        },
      });
    };
    const attentionOrder = await createOrder(organizationId, store.id, 'main');
    attentionOrderId = attentionOrder.id;
    await createOrder(foreignOrganizationId, foreignStore.id, 'foreign');
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        amount: 10_000,
        attemptNumber: 1,
        checkoutUrl: 'https://checkout.invalid/pii-token',
        createdAt: new Date('2026-07-18T10:30:00.000Z'),
        currency: 'COP',
        expiresAt: new Date('2099-07-18T10:30:00.000Z'),
        externalReference: `alerts-${randomUUID()}`,
        idempotencyKey: `alerts-intent-${randomUUID()}`,
        orderId: attentionOrder.id,
        organizationId,
        status: 'ERROR',
        storeId: store.id,
      },
    });
    paymentIntentId = paymentIntent.id;

    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    evaluator = app.get(OperationalAlertEvaluatorService);
    scheduler = app.get(OperationalAlertSchedulerService);
    const login = async (email: string, targetOrganizationId = organizationId) => {
      const response = await request(baseUrl)
        .post('/auth/login')
        .send({ email, organizationId: targetOrganizationId, password })
        .expect(200);
      return (response.body as Tokens).accessToken;
    };
    [ownerToken, operationsToken, supportToken, readOnlyToken, foreignOwnerToken] =
      await Promise.all([
        login(owner.email),
        login(operations.email),
        login(support.email),
        login(reader.email),
        login(foreignOwner.email, foreignOrganizationId),
      ]);
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

  it('publishes five explicit versioned rules without SLA or severity', async () => {
    const response = await request(baseUrl)
      .get(`${endpoint()}/rules`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect('cache-control', 'no-store');
    const body = response.body as RulesResponse;
    expect(body).toMatchObject({ contractVersion: 'v1' });
    expect(body.rules).toHaveLength(5);
    expect(body.rules.every(({ version }) => version === 1)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/severity|sla|email|phone/u);
  });

  it('evaluates a bounded scheduler batch and deduplicates concurrent replay durably', async () => {
    const initial = await scheduler.runOnce(window.to);
    expect(initial).toMatchObject({ created: 3, refreshed: 0, resolved: 0 });
    const results = await Promise.all([
      evaluator.evaluateOrganizations([organizationId, foreignOrganizationId], window),
      evaluator.evaluateOrganizations([organizationId, foreignOrganizationId], window),
    ]);
    expect(results.reduce((total, result) => total + result.created, 0)).toBe(0);
    expect(results.reduce((total, result) => total + result.refreshed, 0)).toBe(6);
    expect(await prisma.operationalAlert.count({ where: { status: 'OPEN' } })).toBe(3);
    expect(await prisma.operationalAlert.count({ where: { organizationId, status: 'OPEN' } })).toBe(
      2,
    );
  });

  it('lists a minimal PII-free projection with filters, cursor, audit and bounded metrics', async () => {
    const first = await request(baseUrl)
      .get(endpoint())
      .query({ limit: 1, status: 'open' })
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(200);
    const firstBody = first.body as AlertResponse;
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).not.toBeNull();
    const second = await request(baseUrl)
      .get(endpoint())
      .query({ cursor: firstBody.nextCursor, limit: 1, status: 'open' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const secondBody = second.body as AlertResponse;
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0]?.alertId).not.toBe(firstBody.items[0]?.alertId);
    const orders = await request(baseUrl)
      .get(endpoint())
      .query({ type: 'order' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const ordersBody = orders.body as AlertResponse;
    expect(ordersBody.items).toHaveLength(1);
    expect(
      JSON.stringify({ first: firstBody, second: secondBody, orders: ordersBody }),
    ).not.toMatch(/source-pii|@example\.test|\+5730|checkout\.invalid|storeId|itemId|orderId/u);
    const audit = await prisma.auditLog.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { action: 'operations.alerts.listed' },
    });
    expect(JSON.stringify(audit.metadataJson)).not.toMatch(/@example\.test|\+5730|checkout/u);
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_operational_alert_operations_total');
  });

  it('survives application restart without losing alert state', async () => {
    const countBefore = await prisma.operationalAlert.count();
    await app?.close();
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    evaluator = app.get(OperationalAlertEvaluatorService);
    scheduler = app.get(OperationalAlertSchedulerService);
    await request(baseUrl).get(endpoint()).set('authorization', `Bearer ${ownerToken}`).expect(200);
    expect(await prisma.operationalAlert.count()).toBe(countBefore);
  });

  it('resolves idempotently and creates a new lifecycle when attention recovers', async () => {
    await Promise.all([
      prisma.order.update({
        data: { currentState: 'READY_FOR_LOGISTICS' },
        where: { id: attentionOrderId },
      }),
      prisma.paymentIntent.update({ data: { status: 'APPROVED' }, where: { id: paymentIntentId } }),
    ]);
    const resolved = await evaluator.evaluateOrganizations([organizationId], window);
    expect(resolved).toMatchObject({ created: 0, refreshed: 0, resolved: 2 });
    const replay = await evaluator.evaluateOrganizations([organizationId], window);
    expect(replay).toMatchObject({ created: 0, refreshed: 0, resolved: 0 });
    expect(
      await prisma.operationalAlert.count({ where: { organizationId, status: 'RESOLVED' } }),
    ).toBe(2);

    await prisma.order.update({
      data: { currentState: 'MANUAL_REVIEW' },
      where: { id: attentionOrderId },
    });
    const recovered = await evaluator.evaluateOrganizations([organizationId], window);
    expect(recovered).toMatchObject({ created: 1, refreshed: 0, resolved: 0 });
    expect(
      await prisma.operationalAlert.count({
        where: { organizationId, itemType: 'order', status: 'OPEN' },
      }),
    ).toBe(1);
    expect(
      await prisma.operationalAlert.count({ where: { organizationId, itemType: 'order' } }),
    ).toBe(2);
  });

  it('enforces owner/admin/operations RBAC, tenant ownership and strict filters', async () => {
    await request(baseUrl)
      .get(endpoint())
      .set('authorization', `Bearer ${supportToken}`)
      .expect(403);
    await request(baseUrl)
      .get(endpoint())
      .set('authorization', `Bearer ${readOnlyToken}`)
      .expect(403);
    await request(baseUrl)
      .get(endpoint(foreignOrganizationId))
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(403);
    const foreign = await request(baseUrl)
      .get(endpoint(foreignOrganizationId))
      .set('authorization', `Bearer ${foreignOwnerToken}`)
      .expect(200);
    expect((foreign.body as AlertResponse).items).toHaveLength(1);
    for (const query of [
      { cursor: 'not-a-cursor' },
      { limit: 101 },
      { status: 'firing' },
      { type: 'customer' },
      { unknown: 'value' },
    ]) {
      await request(baseUrl)
        .get(endpoint())
        .query(query)
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(400);
    }
  });

  it('fails closed through the independent feature flag and kill switch', async () => {
    process.env.OPERATIONAL_ALERTS_KILL_SWITCH = 'true';
    const disabledApp = await createApplication();
    try {
      await disabledApp.listen(0, '127.0.0.1');
      await request(await disabledApp.getUrl())
        .get(endpoint())
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(503);
      const disabledEvaluator = disabledApp.get(OperationalAlertEvaluatorService);
      await expect(
        disabledEvaluator.evaluateOrganizations([organizationId], window),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      await disabledApp.close();
      process.env.OPERATIONAL_ALERTS_KILL_SWITCH = 'false';
    }
  });
});
