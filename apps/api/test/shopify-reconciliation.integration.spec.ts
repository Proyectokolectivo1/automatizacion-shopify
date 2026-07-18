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
const databaseName = `ecommerce_reconciliation_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'POSTGRES_DB',
  'SHOPIFY_CREDENTIAL_KEYS_JSON',
  'SHOPIFY_CREDENTIAL_KEY_VERSION',
  'SHOPIFY_INTEGRATIONS_ENABLED',
  'SHOPIFY_INTEGRATIONS_KILL_SWITCH',
  'SHOPIFY_ORDER_SYNC_ENABLED',
  'SHOPIFY_ORDER_SYNC_KILL_SWITCH',
  'SHOPIFY_ORDER_SYNC_SIMULATION_MODE',
  'SHOPIFY_RECONCILIATION_ENABLED',
  'SHOPIFY_RECONCILIATION_KILL_SWITCH',
  'SHOPIFY_RECONCILIATION_SIMULATION_MODE',
  'SHOPIFY_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);
const password = 'Correct-password-123';
const windowBody = {
  windowEndedAt: '2026-07-14T19:00:00.000Z',
  windowStartedAt: '2026-07-14T16:00:00.000Z',
};

interface Tokens {
  readonly accessToken: string;
}

interface InspectionResponse {
  readonly items: readonly { readonly id: string }[];
  readonly nextCursor: string | null;
}

describe('Shopify reconciliation operations in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let prisma: PrismaClient;
  let storeId: string;
  let ownerToken: string;
  let operationsToken: string;
  let readOnlyToken: string;
  let orderSync: ShopifyOrderSyncService;

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
      SHOPIFY_INTEGRATIONS_ENABLED: 'true',
      SHOPIFY_INTEGRATIONS_KILL_SWITCH: 'false',
      SHOPIFY_ORDER_SYNC_ENABLED: 'true',
      SHOPIFY_ORDER_SYNC_KILL_SWITCH: 'false',
      SHOPIFY_ORDER_SYNC_SIMULATION_MODE: 'true',
      SHOPIFY_RECONCILIATION_ENABLED: 'true',
      SHOPIFY_RECONCILIATION_KILL_SWITCH: 'false',
      SHOPIFY_RECONCILIATION_SIMULATION_MODE: 'true',
      SHOPIFY_SIMULATION_MODE: 'true',
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const organization = await prisma.organization.create({
      data: { name: 'Reconciliation tenant' },
    });
    organizationId = organization.id;
    const passwordHash = await new PasswordService().hash(password);
    for (const [email, role] of [
      ['reconciliation-owner@example.test', 'OWNER'],
      ['reconciliation-operations@example.test', 'OPERATIONS'],
      ['reconciliation-reader@example.test', 'READ_ONLY'],
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
    app = await createApplication();
    orderSync = app.get(ShopifyOrderSyncService);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    ownerToken = await login('reconciliation-owner@example.test');
    operationsToken = await login('reconciliation-operations@example.test');
    readOnlyToken = await login('reconciliation-reader@example.test');

    const registered = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${ownerToken}`)
      .set('idempotency-key', `register-${randomUUID()}`)
      .send({
        accessToken: 'synthetic-reconciliation-token',
        currency: 'COP',
        displayName: 'Reconciliation mock',
        name: 'Reconciliation Store',
        shopDomain: 'reconciliation-fixture.myshopify.com',
        timezone: 'America/Bogota',
      })
      .expect(201);
    storeId = (registered.body as { storeId: string }).storeId;
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/test`)
      .set('authorization', `Bearer ${ownerToken}`)
      .set('idempotency-key', `test-${randomUUID()}`)
      .expect(200);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${ownerToken}`)
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

  const login = async (email: string): Promise<string> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password })
      .expect(200);
    return (response.body as Tokens).accessToken;
  };

  it('detects a missing provider order, persists a checkpoint and enforces RBAC', async () => {
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/shopify/reconciliation/stores/${storeId}/run`,
      )
      .set('authorization', `Bearer ${readOnlyToken}`)
      .send(windowBody)
      .expect(403);
    const response = await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/shopify/reconciliation/stores/${storeId}/run`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .send(windowBody)
      .expect(200);
    expect(response.body).toMatchObject({ detectedCount: 1, mode: 'simulation', resolvedCount: 0 });
    await expect(prisma.reconciliationCheckpoint.count({ where: { storeId } })).resolves.toBe(1);
    const issue = await prisma.orderReconciliationIssue.findFirstOrThrow({ where: { storeId } });
    expect(issue).toMatchObject({
      issueType: 'MISSING_ORDER',
      providerResourceId: '1000000000001',
      status: 'OPEN',
    });
    const inspection = await request(baseUrl)
      .get(`/operations/organizations/${organizationId}/shopify/reconciliation/issues?status=OPEN`)
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(200);
    expect((inspection.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('reprocesses a missing order idempotently through an explicitly generated source event', async () => {
    const issue = await prisma.orderReconciliationIssue.findFirstOrThrow({
      where: { issueType: 'MISSING_ORDER', storeId },
    });
    const key = `reconcile-${randomUUID()}`;
    const endpoint = `/operations/organizations/${organizationId}/shopify/reconciliation/issues/${issue.id}/reprocess`;
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(baseUrl)
          .post(endpoint)
          .set('authorization', `Bearer ${operationsToken}`)
          .set('idempotency-key', key),
      ),
    );
    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    const result = responses[0]?.body as { outboxEventId: string };
    const outbox = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: result.outboxEventId },
    });
    const generated = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: outbox.aggregateId },
    });
    expect(generated).toMatchObject({ reconciliationGenerated: true, signatureValid: false });
    await expect(
      orderSync.syncFromWebhook({
        correlationId: randomUUID(),
        organizationId,
        webhookEventId: generated.id,
      }),
    ).resolves.toMatchObject({ outcome: 'created' });
    await expect(prisma.order.count({ where: { storeId } })).resolves.toBe(1);

    const resolved = await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/shopify/reconciliation/stores/${storeId}/run`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .send(windowBody)
      .expect(200);
    expect(resolved.body).toMatchObject({ detectedCount: 0, resolvedCount: 1 });
    await expect(
      prisma.orderReconciliationIssue.findUniqueOrThrow({ where: { id: issue.id } }),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
  });

  it('detects a failed webhook and requeues only its tenant-owned dead-letter event', async () => {
    const webhook = await prisma.webhookEvent.create({
      data: {
        apiVersion: '2026-07',
        attemptCount: 3,
        eventType: 'orders/create',
        externalEventId: randomUUID(),
        headersRedactedJson: {},
        organizationId,
        payloadHash: randomBytes(32).toString('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        providerResourceId: 'failed-order',
        status: 'DEAD_LETTER',
        storeId,
        triggeredAt: new Date('2026-07-14T17:30:00.000Z'),
        receivedAt: new Date('2026-07-14T17:30:00.000Z'),
      },
    });
    const failedOutbox = await prisma.outboxEvent.create({
      data: {
        aggregateId: webhook.id,
        aggregateType: 'webhook_event',
        attemptCount: 3,
        correlationId: randomUUID(),
        deadLetteredAt: new Date(),
        eventType: 'shopify.webhook.received.v1',
        lastErrorJson: { category: 'consumer_failure' },
        organizationId,
        payloadJson: { mode: 'simulation' },
        status: 'DEAD_LETTER',
      },
    });
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/shopify/reconciliation/stores/${storeId}/run`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .send(windowBody)
      .expect(200);
    const issue = await prisma.orderReconciliationIssue.findFirstOrThrow({
      where: { issueType: 'FAILED_WEBHOOK', webhookEventId: webhook.id },
    });
    await request(baseUrl)
      .post(
        `/operations/organizations/${organizationId}/shopify/reconciliation/issues/${issue.id}/reprocess`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .set('idempotency-key', `failed-${randomUUID()}`)
      .expect(202);
    await expect(
      prisma.outboxEvent.findUniqueOrThrow({ where: { id: failedOutbox.id } }),
    ).resolves.toMatchObject({
      attemptCount: 0,
      deliveryVersion: 2,
      status: 'PENDING',
    });
  });

  it('paginates issues by immutable keyset and binds the cursor to its status filter', async () => {
    const endpoint = `/operations/organizations/${organizationId}/shopify/reconciliation/issues`;
    const first = await request(baseUrl)
      .get(`${endpoint}?limit=1`)
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(200);
    const firstPage = first.body as InspectionResponse;
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const concurrent = await prisma.orderReconciliationIssue.create({
      data: {
        evidenceJson: { state: 'received' },
        fingerprint: randomBytes(32).toString('hex'),
        issueType: 'STUCK_ORDER',
        organizationId,
        provider: 'SHOPIFY',
        providerResourceId: `concurrent-${randomUUID()}`,
        storeId,
      },
    });
    const second = await request(baseUrl)
      .get(`${endpoint}?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`)
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(200);
    const secondPage = second.body as InspectionResponse;
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
    expect(secondPage.items[0]?.id).not.toBe(concurrent.id);

    await request(baseUrl)
      .get(
        `${endpoint}?limit=1&status=OPEN&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
      )
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(400);
    await request(baseUrl)
      .get(`${endpoint}?cursor=invalid`)
      .set('authorization', `Bearer ${operationsToken}`)
      .expect(400);
  });
});
