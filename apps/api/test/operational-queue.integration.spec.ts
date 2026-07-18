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
const databaseName = `ecommerce_operations_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const password = 'Correct-password-123';
const environmentNames = [
  'OPERATIONAL_QUEUE_ENABLED',
  'OPERATIONAL_QUEUE_KILL_SWITCH',
  'POSTGRES_DB',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

interface Tokens {
  readonly accessToken: string;
}

interface QueueItem {
  readonly attentionReason: string | null;
  readonly itemId: string;
  readonly occurredAt: string;
  readonly relatedResource: { readonly id: string; readonly type: string } | null;
  readonly requiresAttention: boolean;
  readonly status: string;
  readonly storeId: string;
  readonly type: string;
}

interface QueueResponse {
  readonly contractVersion: 'v1';
  readonly items: readonly QueueItem[];
  readonly nextCursor: string | null;
}

interface SummaryBreakdown {
  readonly requiresAttention: number;
  readonly status?: string;
  readonly total: number;
  readonly type?: string;
}

interface SummaryResponse {
  readonly byStatus: readonly SummaryBreakdown[];
  readonly byType: readonly SummaryBreakdown[];
  readonly contractVersion: 'v1';
  readonly filters: { readonly storeId: string | null; readonly type: string | null };
  readonly totals: { readonly requiresAttention: number; readonly total: number };
  readonly window: { readonly from: string; readonly to: string };
}

describe('E6 tenant-safe operational read model', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let emptyStoreId: string;
  let foreignOrganizationId: string;
  let foreignOwnerToken: string;
  let organizationId: string;
  let ownerToken: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
  let storeId: string;
  let supportToken: string;

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
      OPERATIONAL_QUEUE_ENABLED: 'true',
      OPERATIONAL_QUEUE_KILL_SWITCH: 'false',
      POSTGRES_DB: databaseName,
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();

    const [organization, foreignOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'Operational tenant' } }),
      prisma.organization.create({ data: { name: 'Foreign operational tenant' } }),
    ]);
    organizationId = organization.id;
    foreignOrganizationId = foreignOrganization.id;
    const createStore = (targetOrganizationId: string, label: string) =>
      prisma.store.create({
        data: {
          currency: 'COP',
          name: `${label} store`,
          organizationId: targetOrganizationId,
          shopifyShopDomain: `${label}-${randomUUID().slice(0, 8)}.myshopify.com`,
          status: 'ACTIVE',
          timezone: 'America/Bogota',
        },
      });
    const [store, emptyStore, foreignStore] = await Promise.all([
      createStore(organizationId, 'operations-main'),
      createStore(organizationId, 'operations-empty'),
      createStore(foreignOrganizationId, 'operations-foreign'),
    ]);
    storeId = store.id;
    emptyStoreId = emptyStore.id;

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
        include: { memberships: true },
      });
    const [owner, operations, support, reader, foreignOwner] = await Promise.all([
      createUser('queue-owner@example.test', 'OWNER'),
      createUser('queue-operations@example.test', 'OPERATIONS'),
      createUser('queue-support@example.test', 'SUPPORT'),
      createUser('queue-reader@example.test', 'READ_ONLY'),
      createUser('queue-foreign@example.test', 'OWNER', foreignOrganizationId),
    ]);

    const createOrder = async (
      targetOrganizationId: string,
      targetStoreId: string,
      state: 'MANUAL_REVIEW' | 'READY_FOR_LOGISTICS',
      at: Date,
      suffix: string,
    ) => {
      const webhook = await prisma.webhookEvent.create({
        data: {
          apiVersion: '2026-07',
          eventType: 'orders/create',
          externalEventId: `queue-${suffix}-${randomUUID()}`,
          headersRedactedJson: {},
          organizationId: targetOrganizationId,
          payloadHash: randomBytes(32).toString('hex'),
          payloadRedactedJson: { synthetic: true },
          provider: 'SHOPIFY',
          receivedAt: at,
          storeId: targetStoreId,
          triggeredAt: at,
        },
      });
      return prisma.order.create({
        data: {
          currency: 'COP',
          currentState: state,
          discountAmount: 0,
          organizationId: targetOrganizationId,
          rawSnapshotJson: { email: 'pii-must-not-leak@example.test', synthetic: true },
          shopifyOrderId: `queue-order-${suffix}`,
          shopifyOrderName: `#QUEUE-${suffix}`,
          sourceCreatedAt: at,
          sourceUpdatedAt: at,
          sourceWebhookEventId: webhook.id,
          storeId: targetStoreId,
          subtotalAmount: 10_000,
          taxAmount: 0,
          totalAmount: 10_000,
        },
      });
    };
    const attentionOrder = await createOrder(
      organizationId,
      storeId,
      'MANUAL_REVIEW',
      new Date('2026-07-17T10:00:00.000Z'),
      'attention',
    );
    await createOrder(
      organizationId,
      storeId,
      'READY_FOR_LOGISTICS',
      new Date('2026-07-17T09:00:00.000Z'),
      'normal',
    );
    await createOrder(
      foreignOrganizationId,
      foreignStore.id,
      'MANUAL_REVIEW',
      new Date('2026-07-17T11:00:00.000Z'),
      'foreign',
    );
    await prisma.orderReconciliationIssue.create({
      data: {
        evidenceJson: { email: 'shopify-issue-pii@example.test' },
        fingerprint: randomBytes(32).toString('hex'),
        firstDetectedAt: new Date('2026-07-17T08:00:00.000Z'),
        issueType: 'STUCK_ORDER',
        lastDetectedAt: new Date('2026-07-17T08:30:00.000Z'),
        orderId: attentionOrder.id,
        organizationId,
        provider: 'SHOPIFY',
        status: 'OPEN',
        storeId,
      },
    });
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        amount: 10_000,
        attemptNumber: 1,
        checkoutUrl: 'https://checkout.invalid/queue',
        createdAt: new Date('2026-07-17T07:00:00.000Z'),
        currency: 'COP',
        expiresAt: new Date('2099-07-17T07:00:00.000Z'),
        externalReference: `queue-${randomUUID()}`,
        idempotencyKey: `queue-intent-${randomUUID()}`,
        orderId: attentionOrder.id,
        organizationId,
        status: 'ERROR',
        storeId,
      },
    });
    const reconciliationRun = await prisma.paymentReconciliationRun.create({
      data: {
        completedAt: new Date('2026-07-17T06:30:00.000Z'),
        differenceCount: 1,
        newIssueCount: 1,
        organizationId,
        provider: 'WOMPI',
        reportJson: { mode: 'simulation' },
        resolvedCount: 0,
        scannedCount: 1,
        startedAt: new Date('2026-07-17T06:00:00.000Z'),
        status: 'COMPLETED',
        storeId,
        windowEndedAt: new Date('2026-07-17T06:00:00.000Z'),
        windowStartedAt: new Date('2026-07-16T06:00:00.000Z'),
      },
    });
    await prisma.paymentReconciliationIssue.create({
      data: {
        authoritativeStatus: 'APPROVED',
        detailJson: { phone: '+573009998877' },
        fingerprint: randomBytes(32).toString('hex'),
        firstDetectedAt: new Date('2026-07-17T06:00:00.000Z'),
        issueType: 'INTENT_STATUS_MISMATCH',
        lastDetectedAt: new Date('2026-07-17T06:30:00.000Z'),
        lastDetectedRunId: reconciliationRun.id,
        localStatus: 'ERROR',
        organizationId,
        paymentIntentId: paymentIntent.id,
        status: 'OPEN',
        storeId,
      },
    });
    const operationsMembershipId = operations.memberships[0]?.id;
    if (operationsMembershipId === undefined) {
      throw new Error('Operations membership was not created');
    }
    const queueCustomer = await prisma.customer.create({
      data: {
        dataProcessingConsent: true,
        organizationId,
        phoneE164: '+573001112233',
        shopifyCustomerId: `queue-customer-${randomUUID()}`,
        storeId,
      },
    });
    await prisma.whatsAppConversation.createMany({
      data: [
        {
          createdAt: new Date('2026-07-17T05:00:00.000Z'),
          customerId: queueCustomer.id,
          lastMessageAt: new Date('2026-07-17T05:30:00.000Z'),
          organizationId,
          phoneE164: '+573001112233',
          status: 'OPEN',
          storeId,
        },
        {
          assignedAt: new Date('2026-07-17T04:30:00.000Z'),
          assignedMembershipId: operationsMembershipId,
          assignmentVersion: 1,
          contactHash: randomBytes(32).toString('hex'),
          createdAt: new Date('2026-07-17T04:00:00.000Z'),
          lastMessageAt: new Date('2026-07-17T04:30:00.000Z'),
          organizationId,
          status: 'OPEN',
          storeId,
        },
      ],
    });

    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const login = async (email: string, targetOrganizationId = organizationId) => {
      const response = await request(baseUrl)
        .post('/auth/login')
        .send({ email, organizationId: targetOrganizationId, password })
        .expect(200);
      return (response.body as Tokens).accessToken;
    };
    [ownerToken, supportToken, readOnlyToken, foreignOwnerToken] = await Promise.all([
      login(owner.email),
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

  const endpoint = (targetOrganizationId = organizationId) =>
    `/operations/organizations/${targetOrganizationId}/queue`;
  const summaryEndpoint = (targetOrganizationId = organizationId) =>
    `${endpoint(targetOrganizationId)}/summary`;

  it('projects five bounded attention types without PII or provider identifiers', async () => {
    const response = await request(baseUrl)
      .get(endpoint())
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect('cache-control', 'no-store');
    const body = response.body as QueueResponse;
    expect(body.contractVersion).toBe('v1');
    expect(new Set(body.items.map(({ type }) => type))).toEqual(
      new Set([
        'order',
        'payment_intent',
        'shopify_reconciliation_issue',
        'whatsapp_conversation',
        'wompi_reconciliation_issue',
      ]),
    );
    expect(body.items.every(({ requiresAttention }) => requiresAttention)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /pii-must-not-leak|shopify-issue-pii|\+5730|checkout\.invalid|queue-order/u,
    );
    expect(
      body.items.find(({ type }) => type === 'wompi_reconciliation_issue')?.relatedResource,
    ).toMatchObject({ type: 'payment_intent' });

    const audit = await prisma.auditLog.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { action: 'operations.queue.listed' },
    });
    expect(JSON.stringify(audit)).not.toMatch(/@example\.test|\+5730|checkout\.invalid/u);
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_operational_queue_operations_total');
  });

  it('summarizes the shared v1 attention policy in one bounded aggregate query', async () => {
    const response = await request(baseUrl)
      .get(summaryEndpoint())
      .query({ from: '2026-07-17T04:00:00.000Z', to: '2026-07-17T11:00:00.000Z' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect('cache-control', 'no-store');
    const body = response.body as SummaryResponse;
    expect(body).toMatchObject({
      contractVersion: 'v1',
      filters: { storeId: null, type: null },
      totals: { requiresAttention: 5, total: 7 },
      window: {
        from: '2026-07-17T04:00:00.000Z',
        to: '2026-07-17T11:00:00.000Z',
      },
    });
    expect(body.byType).toEqual(
      expect.arrayContaining([
        { requiresAttention: 1, total: 2, type: 'order' },
        { requiresAttention: 1, total: 1, type: 'payment_intent' },
        { requiresAttention: 1, total: 1, type: 'shopify_reconciliation_issue' },
        { requiresAttention: 1, total: 2, type: 'whatsapp_conversation' },
        { requiresAttention: 1, total: 1, type: 'wompi_reconciliation_issue' },
      ]),
    );
    expect(body.byStatus).toContainEqual({
      requiresAttention: 3,
      status: 'open',
      total: 4,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /pii-must-not-leak|shopify-issue-pii|\+5730|checkout\.invalid|queue-order/u,
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { action: 'operations.summary.viewed' },
    });
    expect(audit.metadataJson).toMatchObject({ total: 7, type: 'all', windowMinutes: 420 });
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain(
      'ecommerce_api_operational_queue_operations_total{action="summary",outcome="success"}',
    );
  });

  it('paginates by immutable timestamp and excludes concurrent newer inserts from the next page', async () => {
    const first = await request(baseUrl)
      .get(endpoint())
      .query({ limit: 2 })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const firstBody = first.body as QueueResponse;
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    if (firstBody.nextCursor === null) throw new Error('Expected an operational cursor');

    const webhook = await prisma.webhookEvent.create({
      data: {
        apiVersion: '2026-07',
        eventType: 'orders/create',
        externalEventId: `queue-concurrent-${randomUUID()}`,
        headersRedactedJson: {},
        organizationId,
        payloadHash: randomBytes(32).toString('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        receivedAt: new Date('2026-07-17T12:00:00.000Z'),
        storeId,
        triggeredAt: new Date('2026-07-17T12:00:00.000Z'),
      },
    });
    const concurrent = await prisma.order.create({
      data: {
        currency: 'COP',
        currentState: 'MANUAL_REVIEW',
        discountAmount: 0,
        organizationId,
        rawSnapshotJson: { synthetic: true },
        shopifyOrderId: `queue-concurrent-${randomUUID()}`,
        shopifyOrderName: '#QUEUE-CONCURRENT',
        sourceCreatedAt: new Date('2026-07-17T12:00:00.000Z'),
        sourceUpdatedAt: new Date('2026-07-17T12:00:00.000Z'),
        sourceWebhookEventId: webhook.id,
        storeId,
        subtotalAmount: 1,
        taxAmount: 0,
        totalAmount: 1,
      },
    });
    const second = await request(baseUrl)
      .get(endpoint())
      .query({ cursor: firstBody.nextCursor, limit: 100 })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const secondBody = second.body as QueueResponse;
    expect(secondBody.items.map(({ itemId }) => itemId)).not.toContain(concurrent.id);
    expect(secondBody.items.map(({ itemId }) => itemId)).not.toContain(firstBody.items[0]?.itemId);
    expect(secondBody.items.map(({ itemId }) => itemId)).not.toContain(firstBody.items[1]?.itemId);
  });

  it('supports bounded filters and rejects malformed filters or cursors', async () => {
    const normalOrders = await request(baseUrl)
      .get(endpoint())
      .query({ requiresAttention: 'false', type: 'order' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const normalBody = normalOrders.body as QueueResponse;
    expect(normalBody.items).toHaveLength(1);
    expect(normalBody.items[0]).toMatchObject({ status: 'ready_for_logistics', type: 'order' });

    const emptyStore = await request(baseUrl)
      .get(endpoint())
      .query({ storeId: emptyStoreId })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((emptyStore.body as QueueResponse).items).toHaveLength(0);
    const dated = await request(baseUrl)
      .get(endpoint())
      .query({
        from: '2026-07-17T05:30:00.000Z',
        to: '2026-07-17T08:30:00.000Z',
      })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((dated.body as QueueResponse).items.map(({ type }) => type).sort()).toEqual([
      'payment_intent',
      'shopify_reconciliation_issue',
      'wompi_reconciliation_issue',
    ]);
    for (const query of [
      { cursor: 'not-a-cursor' },
      { requiresAttention: 'yes' },
      { type: 'unknown' },
      { from: '2026-07-18T00:00:00.000Z', to: '2026-07-17T00:00:00.000Z' },
      { unknown: 'value' },
    ]) {
      await request(baseUrl)
        .get(endpoint())
        .query(query)
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(400);
    }
  });

  it('bounds summary windows and supports type, store and empty-result filters', async () => {
    const window = { from: '2026-07-17T04:00:00.000Z', to: '2026-07-17T11:00:00.000Z' };
    const orders = await request(baseUrl)
      .get(summaryEndpoint())
      .query({ ...window, type: 'order' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((orders.body as SummaryResponse).totals).toEqual({
      requiresAttention: 1,
      total: 2,
    });
    expect((orders.body as SummaryResponse).byType).toEqual([
      { requiresAttention: 1, total: 2, type: 'order' },
    ]);

    const empty = await request(baseUrl)
      .get(summaryEndpoint())
      .query({ ...window, storeId: emptyStoreId })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(empty.body).toMatchObject({ byStatus: [], byType: [], totals: { total: 0 } });

    for (const query of [
      { from: window.from },
      { to: window.to },
      { from: window.from, to: window.from },
      { from: '2026-07-18T00:00:00.000Z', to: '2026-07-17T00:00:00.000Z' },
      { from: '2026-01-01T00:00:00.000Z', to: '2026-02-02T00:00:00.000Z' },
      { ...window, status: 'open' },
      { ...window, storeId: 'not-a-uuid' },
      { ...window, type: 'unknown' },
      { ...window, unknown: 'value' },
    ]) {
      await request(baseUrl)
        .get(summaryEndpoint())
        .query(query)
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(400);
    }
  });

  it('enforces least-privilege RBAC and tenant isolation', async () => {
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
    const foreignBody = foreign.body as QueueResponse;
    expect(foreignBody.items).toHaveLength(1);
    expect(foreignBody.items.every(({ storeId: itemStoreId }) => itemStoreId !== storeId)).toBe(
      true,
    );
    await request(baseUrl)
      .get(summaryEndpoint())
      .query({ from: '2026-07-17T04:00:00.000Z', to: '2026-07-17T12:00:00.000Z' })
      .set('authorization', `Bearer ${supportToken}`)
      .expect(403);
    await request(baseUrl)
      .get(summaryEndpoint(foreignOrganizationId))
      .query({ from: '2026-07-17T10:00:00.000Z', to: '2026-07-17T12:00:00.000Z' })
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(403);
    const foreignSummary = await request(baseUrl)
      .get(summaryEndpoint(foreignOrganizationId))
      .query({ from: '2026-07-17T10:00:00.000Z', to: '2026-07-17T12:00:00.000Z' })
      .set('authorization', `Bearer ${foreignOwnerToken}`)
      .expect(200);
    expect((foreignSummary.body as SummaryResponse).totals).toEqual({
      requiresAttention: 1,
      total: 1,
    });
  });

  it('fails closed with its independent kill switch', async () => {
    process.env.OPERATIONAL_QUEUE_KILL_SWITCH = 'true';
    const disabledApp = await createApplication();
    try {
      await disabledApp.listen(0, '127.0.0.1');
      await request(await disabledApp.getUrl())
        .get(endpoint())
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(503);
      await request(await disabledApp.getUrl())
        .get(summaryEndpoint())
        .query({ from: '2026-07-17T04:00:00.000Z', to: '2026-07-17T11:00:00.000Z' })
        .set('authorization', `Bearer ${ownerToken}`)
        .expect(503);
    } finally {
      await disabledApp.close();
      process.env.OPERATIONAL_QUEUE_KILL_SWITCH = 'false';
    }
  });
});
