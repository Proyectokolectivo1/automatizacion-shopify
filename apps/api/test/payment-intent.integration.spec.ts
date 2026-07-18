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
import fixture from '../src/payments/fixtures/wompi-event.v1.json';
import { PaymentExpirationSchedulerService } from '../src/payments/payment-expiration-scheduler.service';
import { PaymentReminderSchedulerService } from '../src/payments/payment-reminder-scheduler.service';
import { createWompiEventChecksum } from '../src/payments/wompi-event-signature';
import { WompiMockProvider } from '../src/payments/wompi-mock.provider';
import { WompiReconciliationSchedulerService } from '../src/payments/wompi-reconciliation-scheduler.service';

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
const databaseName = `ecommerce_wompi_intents_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'POSTGRES_DB',
  'WOMPI_ENABLED',
  'WOMPI_KILL_SWITCH',
  'WOMPI_SIMULATION_MODE',
  'WOMPI_PAYMENT_LINK_TTL_MINUTES',
  'WOMPI_WEBHOOKS_ENABLED',
  'WOMPI_WEBHOOKS_KILL_SWITCH',
  'WOMPI_WEBHOOKS_MAX_SKEW_SECONDS',
  'PAYMENT_REMINDERS_ENABLED',
  'PAYMENT_REMINDERS_KILL_SWITCH',
  'PAYMENT_REMINDERS_SIMULATION_MODE',
  'PAYMENT_REMINDERS_POLL_INTERVAL_MS',
  'PAYMENT_EXPIRATION_ENABLED',
  'PAYMENT_EXPIRATION_KILL_SWITCH',
  'PAYMENT_EXPIRATION_SIMULATION_MODE',
  'PAYMENT_EXPIRATION_DEFAULT_ACTION',
  'PAYMENT_EXPIRATION_POLL_INTERVAL_MS',
  'WOMPI_RECONCILIATION_ENABLED',
  'WOMPI_RECONCILIATION_KILL_SWITCH',
  'WOMPI_RECONCILIATION_SIMULATION_MODE',
  'WOMPI_RECONCILIATION_POLL_INTERVAL_MS',
  'WOMPI_RECONCILIATION_INTERVAL_HOURS',
  'WOMPI_RECONCILIATION_LOOKBACK_HOURS',
  'WOMPI_RECONCILIATION_BATCH_SIZE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);
const password = 'Correct-password-123';

interface Tokens {
  readonly accessToken: string;
}

describe('Wompi payment intents in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let expirations: PaymentExpirationSchedulerService;
  let operationsToken: string;
  let orderId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
  let reminders: PaymentReminderSchedulerService;
  let reconciliation: WompiReconciliationSchedulerService;
  let wompi: WompiMockProvider;
  let eventSequence = 0;
  let orderSequence = 0;

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
      WOMPI_ENABLED: 'true',
      WOMPI_KILL_SWITCH: 'false',
      WOMPI_PAYMENT_LINK_TTL_MINUTES: '60',
      WOMPI_SIMULATION_MODE: 'true',
      WOMPI_WEBHOOKS_ENABLED: 'true',
      WOMPI_WEBHOOKS_KILL_SWITCH: 'false',
      WOMPI_WEBHOOKS_MAX_SKEW_SECONDS: '300',
      PAYMENT_REMINDERS_ENABLED: 'true',
      PAYMENT_REMINDERS_KILL_SWITCH: 'false',
      PAYMENT_REMINDERS_SIMULATION_MODE: 'true',
      PAYMENT_REMINDERS_POLL_INTERVAL_MS: '60000',
      PAYMENT_EXPIRATION_ENABLED: 'true',
      PAYMENT_EXPIRATION_KILL_SWITCH: 'false',
      PAYMENT_EXPIRATION_SIMULATION_MODE: 'true',
      PAYMENT_EXPIRATION_DEFAULT_ACTION: 'MARK',
      PAYMENT_EXPIRATION_POLL_INTERVAL_MS: '60000',
      WOMPI_RECONCILIATION_ENABLED: 'true',
      WOMPI_RECONCILIATION_KILL_SWITCH: 'false',
      WOMPI_RECONCILIATION_SIMULATION_MODE: 'true',
      WOMPI_RECONCILIATION_POLL_INTERVAL_MS: '60000',
      WOMPI_RECONCILIATION_INTERVAL_HOURS: '24',
      WOMPI_RECONCILIATION_LOOKBACK_HOURS: '24',
      WOMPI_RECONCILIATION_BATCH_SIZE: '25',
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    organizationId = (await prisma.organization.create({ data: { name: 'Wompi tenant' } })).id;
    otherOrganizationId = (
      await prisma.organization.create({ data: { name: 'Other Wompi tenant' } })
    ).id;
    const passwordHash = await new PasswordService().hash(password);
    for (const [email, role] of [
      ['wompi-operations@example.test', 'OPERATIONS'],
      ['wompi-reader@example.test', 'READ_ONLY'],
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
    orderId = await seedResolvedCodOrder();
    app = await createApplication();
    wompi = app.get(WompiMockProvider);
    reminders = app.get(PaymentReminderSchedulerService);
    reconciliation = app.get(WompiReconciliationSchedulerService);
    expirations = app.get(PaymentExpirationSchedulerService);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    operationsToken = await login('wompi-operations@example.test');
    readOnlyToken = await login('wompi-reader@example.test');
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

  const seedResolvedCodOrder = async (tenantId = organizationId): Promise<string> => {
    orderSequence += 1;
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: `Wompi Store ${orderSequence}`,
        organizationId: tenantId,
        shopifyShopDomain: `wompi-intents-${orderSequence}.myshopify.com`,
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    const webhook = await prisma.webhookEvent.create({
      data: {
        apiVersion: '2026-07',
        eventType: 'orders/create',
        externalEventId: randomUUID(),
        headersRedactedJson: {},
        organizationId: tenantId,
        payloadHash: randomBytes(32).toString('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        providerResourceId: randomUUID(),
        storeId: store.id,
        triggeredAt: new Date(),
      },
    });
    const order = await prisma.order.create({
      data: {
        currency: 'COP',
        currentState: 'PENDING_TRANSPORT_PAYMENT',
        discountAmount: 0n,
        organizationId: tenantId,
        paymentMode: 'COD',
        rawSnapshotJson: { synthetic: true },
        shopifyOrderId: randomUUID(),
        shopifyOrderName: `#WOMPI-${orderSequence}`,
        sourceCreatedAt: new Date(),
        sourceUpdatedAt: new Date(),
        sourceWebhookEventId: webhook.id,
        storeId: store.id,
        subtotalAmount: 10_000_000n,
        taxAmount: 0n,
        totalAmount: 10_000_000n,
        transportChargeAmount: 1_200_000n,
      },
    });
    const policy = await prisma.transportRatePolicy.create({
      data: {
        activatedAt: new Date(),
        active: true,
        organizationId: tenantId,
        storeId: store.id,
        version: 1,
      },
    });
    const rule = await prisma.transportRateRule.create({
      data: {
        amount: 1_200_000n,
        organizationId: tenantId,
        policyId: policy.id,
        priority: 100,
        ruleKey: 'wompi-rate',
      },
    });
    await prisma.transportRateDecision.create({
      data: {
        amount: 1_200_000n,
        currency: 'COP',
        evaluatedAt: new Date(),
        idempotencyKey: `synthetic:${randomUUID()}`,
        orderId: order.id,
        organizationId: tenantId,
        policyId: policy.id,
        ruleId: rule.id,
        storeId: store.id,
      },
    });
    return order.id;
  };

  const createIntent = (
    token: string,
    key = `intent-${randomUUID()}`,
    tenant = organizationId,
    targetOrderId = orderId,
  ) =>
    request(baseUrl)
      .post(`/operations/organizations/${tenant}/payments/orders/${targetOrderId}/intents`)
      .set('authorization', `Bearer ${token}`)
      .set('idempotency-key', key);

  const buildEvent = async (
    status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'PENDING' | 'VOIDED',
    amountDelta = 0,
    validSignature = true,
    targetOrderId = orderId,
  ): Promise<string> => {
    const intent = await prisma.paymentIntent.findFirstOrThrow({
      where: { orderId: targetOrderId },
    });
    if (intent.providerCheckoutId === null) throw new Error('Synthetic transaction id is missing');
    wompi.setSyntheticTransactionStatus(intent.providerCheckoutId, status);
    const timestamp = Date.now() + eventSequence++;
    const data = {
      transaction: {
        amount_in_cents: Number(intent.amount) + amountDelta,
        currency: 'COP' as const,
        id: intent.providerCheckoutId,
        reference: intent.externalReference,
        status,
      },
    };
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const checksum = createWompiEventChecksum({ data, properties, timestamp }, fixture.eventSecret);
    return JSON.stringify({
      _fixture: { synthetic: true, version: 'v1' },
      data,
      event: 'transaction.updated',
      sent_at: new Date(timestamp).toISOString(),
      signature: { checksum: validSignature ? checksum : '0'.repeat(64), properties },
      timestamp,
    });
  };

  const deliverEvent = (rawBody: string) =>
    request(baseUrl)
      .post('/webhooks/wompi/transactions')
      .set('content-type', 'application/json')
      .send(rawBody);

  it('enforces RBAC and tenant isolation before creating a checkout', async () => {
    await createIntent(readOnlyToken).expect(403);
    await createIntent(operationsToken, `other-${randomUUID()}`, otherOrganizationId).expect(403);
    await expect(prisma.paymentIntent.count()).resolves.toBe(0);
  });

  it('rejects client-controlled payment fields', async () => {
    await createIntent(operationsToken).send({ amountMinor: 1 }).expect(400);
    await expect(prisma.paymentIntent.count()).resolves.toBe(0);
  });

  it('creates one signed synthetic checkout under concurrent lost-response replay', async () => {
    const key = `concurrent-${randomUUID()}`;
    const responses = await Promise.all([
      createIntent(operationsToken, key),
      createIntent(operationsToken, key),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[0]?.body).toMatchObject({
      amountMinor: 1_200_000,
      attemptNumber: 1,
      currency: 'COP',
      mode: 'simulation',
      outcome: 'created',
      provider: 'wompi',
      status: 'pending',
    });
    const checkout = new URL((responses[0]?.body as { checkoutUrl: string }).checkoutUrl);
    expect(checkout.hostname).toBe('checkout.wompi.simulated.invalid');
    expect(checkout.searchParams.get('amount-in-cents')).toBe('1200000');
    expect(checkout.searchParams.get('signature:integrity')).toMatch(/^[a-f0-9]{64}$/u);
    await expect(prisma.paymentIntent.count({ where: { orderId } })).resolves.toBe(1);
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId } });
    const schedule = await prisma.paymentReminder.findMany({
      orderBy: { sequence: 'asc' },
      where: { paymentIntentId: intent.id },
    });
    expect(schedule).toHaveLength(2);
    expect(schedule.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(schedule[0]?.scheduledAt.getTime()).toBe(
      intent.createdAt.getTime() + 8 * 60 * 60 * 1_000,
    );
    expect(schedule[1]?.scheduledAt.getTime()).toBe(
      intent.createdAt.getTime() + 16 * 60 * 60 * 1_000,
    );
    await expect(
      prisma.outboxEvent.count({
        where: { eventType: 'payment.intent.created.v1', organizationId },
      }),
    ).resolves.toBe(1);
  });

  it('replays the live intent for a new key without duplicating effects', async () => {
    const response = await createIntent(operationsToken).expect(201);
    expect(response.body).toMatchObject({ outcome: 'replayed' });
    await expect(prisma.paymentIntent.count({ where: { orderId } })).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: { eventType: 'payment.intent.created.v1', organizationId },
      }),
    ).resolves.toBe(1);
  });

  it('requests the first due reminder once under concurrent scheduler execution', async () => {
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId } });
    const first = await prisma.paymentReminder.findUniqueOrThrow({
      where: { paymentIntentId_sequence: { paymentIntentId: intent.id, sequence: 1 } },
    });
    const now = new Date();
    await prisma.paymentReminder.update({
      data: { scheduledAt: new Date(now.getTime() - 1_000) },
      where: { id: first.id },
    });
    const batches = await Promise.all([reminders.processDue(now), reminders.processDue(now)]);
    expect(batches.reduce((total, batch) => total + batch.requested, 0)).toBe(1);
    await expect(reminders.processDue(now)).resolves.toEqual({ cancelled: 0, requested: 0 });
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'payment.reminder.requested.v1' } }),
    ).resolves.toBe(1);
    await expect(prisma.paymentReminder.groupBy({ by: ['status'], _count: true })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _count: 1, status: 'REQUESTED' }),
        expect.objectContaining({ _count: 1, status: 'SCHEDULED' }),
      ]),
    );
  });

  it('accepts one concurrent signed event only after authoritative verification', async () => {
    const rawBody = await buildEvent('APPROVED');
    const responses = await Promise.all([deliverEvent(rawBody), deliverEvent(rawBody)]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses.map(({ body }) => (body as { duplicate: boolean }).duplicate).sort()).toEqual([
      false,
      true,
    ]);
    expect(responses[0]?.body).toMatchObject({
      accepted: true,
      mode: 'simulation',
      status: 'approved',
    });
    await expect(
      prisma.paymentIntent.findFirstOrThrow({ where: { orderId } }),
    ).resolves.toMatchObject({
      status: 'APPROVED',
    });
    await expect(prisma.paymentProviderEvent.count()).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'payment.intent.status-updated.v1' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentReminder.count({
        where: {
          paymentIntentId: (responses[0]?.body as { intentId: string }).intentId,
          status: 'CANCELLED',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'payment.reminder.requested.v1' } }),
    ).resolves.toBe(1);
  });

  it('persists and rejects a signed amount that differs from authoritative data', async () => {
    const rawBody = await buildEvent('APPROVED', 1);
    await deliverEvent(rawBody).expect(409);
    await expect(
      prisma.paymentProviderEvent.count({ where: { rejectionReason: 'provider_mismatch' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentIntent.findFirstOrThrow({ where: { orderId } }),
    ).resolves.toMatchObject({
      status: 'APPROVED',
    });
  });

  it('persists and rejects an invalid event checksum without provider state changes', async () => {
    const rawBody = await buildEvent('APPROVED', 0, false);
    await deliverEvent(rawBody).expect(401);
    await expect(
      prisma.paymentProviderEvent.count({ where: { rejectionReason: 'invalid_signature' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'payment.intent.status-updated.v1' } }),
    ).resolves.toBe(1);
  });

  it('cancels a due reminder instead of requesting delivery after intent expiration', async () => {
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId } });
    const second = await prisma.paymentReminder.findUniqueOrThrow({
      where: { paymentIntentId_sequence: { paymentIntentId: intent.id, sequence: 2 } },
    });
    const now = new Date();
    await prisma.$transaction([
      prisma.paymentIntent.update({
        data: { expiresAt: new Date(intent.createdAt.getTime() + 1), status: 'PENDING' },
        where: { id: intent.id },
      }),
      prisma.paymentReminder.update({
        data: {
          cancellationReason: null,
          cancelledAt: null,
          scheduledAt: new Date(now.getTime() - 1_000),
          status: 'SCHEDULED',
        },
        where: { id: second.id },
      }),
    ]);
    await expect(reminders.processDue(now)).resolves.toEqual({ cancelled: 1, requested: 0 });
    await expect(
      prisma.paymentReminder.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({
      cancellationReason: 'intent_expired',
      status: 'CANCELLED',
    });
    await expect(
      prisma.outboxEvent.count({ where: { eventType: 'payment.reminder.requested.v1' } }),
    ).resolves.toBe(1);
    await prisma.paymentIntent.update({ data: { status: 'APPROVED' }, where: { id: intent.id } });
  });

  it('expires once, records abandonment history and cancels remaining reminders', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `expiration-mark-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intentId = (response.body as { intentId: string }).intentId;
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    expect(intent.abandonmentAction).toBe('MARK');
    const now = new Date(intent.expiresAt.getTime() + 1);
    const batches = await Promise.all([expirations.processDue(now), expirations.processDue(now)]);
    expect(batches.reduce((total, batch) => total + batch.expired, 0)).toBe(1);
    expect(batches.reduce((total, batch) => total + batch.marked, 0)).toBe(1);
    await expect(expirations.processDue(now)).resolves.toEqual({
      cancellationRequested: 0,
      expired: 0,
      marked: 0,
      skippedOrders: 0,
    });
    await expect(
      prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } }),
    ).resolves.toMatchObject({
      expiredAt: now,
      status: 'EXPIRED',
    });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } }),
    ).resolves.toMatchObject({
      currentState: 'ABANDONO_PAGO_TRANSPORTE',
    });
    await expect(
      prisma.orderStateHistory.findMany({
        orderBy: { createdAt: 'asc' },
        where: { orderId: targetOrderId, triggerType: 'payment_expiration' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        fromState: 'PENDING_TRANSPORT_PAYMENT',
        toState: 'TRANSPORT_PAYMENT_EXPIRED',
      }),
      expect.objectContaining({
        fromState: 'TRANSPORT_PAYMENT_EXPIRED',
        toState: 'ABANDONO_PAGO_TRANSPORTE',
      }),
    ]);
    await expect(
      prisma.paymentReminder.count({ where: { paymentIntentId: intentId, status: 'CANCELLED' } }),
    ).resolves.toBe(2);
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: intentId, eventType: 'payment.intent.expired.v1' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: {
          aggregateId: targetOrderId,
          eventType: 'shopify.order.abandonment-action.requested.v1',
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps CANCEL tenant-safe as a simulated request without claiming Shopify changed', async () => {
    const targetOrderId = await seedResolvedCodOrder(otherOrganizationId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } });
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000);
    const intent = await prisma.paymentIntent.create({
      data: {
        abandonmentAction: 'CANCEL',
        amount: order.transportChargeAmount,
        attemptNumber: 1,
        checkoutUrl: 'https://checkout.wompi.simulated.invalid/cancel-policy',
        currency: 'COP',
        expiresAt,
        externalReference: `cancel-${randomUUID()}`,
        idempotencyKey: `cancel-${randomUUID()}`,
        orderId: targetOrderId,
        organizationId: otherOrganizationId,
        provider: 'WOMPI',
        providerCheckoutId: `cancel-${randomUUID()}`,
        storeId: order.storeId,
      },
    });
    await prisma.paymentReminder.createMany({
      data: [
        {
          organizationId: otherOrganizationId,
          paymentIntentId: intent.id,
          scheduledAt: new Date(createdAt.getTime() + 8 * 60 * 60 * 1_000),
          sequence: 1,
          storeId: order.storeId,
        },
        {
          organizationId: otherOrganizationId,
          paymentIntentId: intent.id,
          scheduledAt: new Date(createdAt.getTime() + 16 * 60 * 60 * 1_000),
          sequence: 2,
          storeId: order.storeId,
        },
      ],
    });
    await expect(expirations.processDue(new Date(expiresAt.getTime() + 1))).resolves.toEqual({
      cancellationRequested: 1,
      expired: 1,
      marked: 0,
      skippedOrders: 0,
    });
    const action = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregateId: targetOrderId,
        eventType: 'shopify.order.abandonment-action.requested.v1',
      },
    });
    expect(action.organizationId).toBe(otherOrganizationId);
    expect(action.payloadJson).toMatchObject({ action: 'cancel', mode: 'simulation' });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } }),
    ).resolves.toMatchObject({
      currentState: 'ABANDONO_PAGO_TRANSPORTE',
    });
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: intent.id, organizationId: organizationId },
      }),
    ).resolves.toBe(0);
  });

  it('routes an authoritative approval after expiration to manual review', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `late-approval-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intentId = (response.body as { intentId: string }).intentId;
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    await expect(
      expirations.processDue(new Date(intent.expiresAt.getTime() + 1)),
    ).resolves.toMatchObject({ expired: 1, marked: 1 });
    const rawBody = await buildEvent('APPROVED', 0, true, targetOrderId);
    await deliverEvent(rawBody).expect(200);
    await expect(
      prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } }),
    ).resolves.toMatchObject({
      status: 'EXPIRED',
    });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } }),
    ).resolves.toMatchObject({
      currentState: 'MANUAL_REVIEW',
    });
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: intentId, eventType: 'payment.intent.late-status-observed.v1' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.orderStateHistory.count({
        where: {
          orderId: targetOrderId,
          reason: 'late_approved_payment_requires_manual_review',
        },
      }),
    ).resolves.toBe(1);
  });

  it('serializes simultaneous approval and expiration without reverting a terminal status', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `expiration-race-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intentId = (response.body as { intentId: string }).intentId;
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    const rawBody = await buildEvent('APPROVED', 0, true, targetOrderId);
    const [batch, webhook] = await Promise.all([
      expirations.processDue(new Date(intent.expiresAt.getTime() + 1)),
      deliverEvent(rawBody),
    ]);
    expect(webhook.status).toBe(200);
    const finalIntent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } });
    if (finalIntent.status === 'APPROVED') {
      expect(batch.expired).toBe(0);
      expect(finalOrder.currentState).toBe('PENDING_TRANSPORT_PAYMENT');
    } else {
      expect(finalIntent.status).toBe('EXPIRED');
      expect(batch.expired).toBe(1);
      expect(finalOrder.currentState).toBe('MANUAL_REVIEW');
      await expect(
        prisma.outboxEvent.count({
          where: { aggregateId: intentId, eventType: 'payment.intent.late-status-observed.v1' },
        }),
      ).resolves.toBe(1);
    }
  });

  it('creates one durable consistent reconciliation report under concurrent replay', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `reconciliation-consistent-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intentId = (response.body as { intentId: string }).intentId;
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    const now = new Date();
    const results = await Promise.all([
      reconciliation.reconcileStore(organizationId, intent.storeId, now),
      reconciliation.reconcileStore(organizationId, intent.storeId, now),
    ]);
    expect(results.filter(({ skipped }) => skipped)).toHaveLength(1);
    expect(results.filter(({ scanned }) => scanned === 1)).toHaveLength(1);
    expect(results.reduce((total, result) => total + result.differences, 0)).toBe(0);
    await expect(
      prisma.paymentReconciliationRun.count({ where: { storeId: intent.storeId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentReconciliationCheckpoint.findUniqueOrThrow({
        where: { storeId_provider: { provider: 'WOMPI', storeId: intent.storeId } },
      }),
    ).resolves.toMatchObject({
      consecutiveFailures: 0,
      lastFailureAt: null,
      windowEndedAt: now,
    });
    await expect(
      prisma.outboxEvent.count({
        where: {
          aggregateType: 'payment_reconciliation_run',
          organizationId,
        },
      }),
    ).resolves.toBe(0);
  });

  it('deduplicates divergent status issues, alerts per report and resolves after an event', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `reconciliation-divergent-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intentId = (response.body as { intentId: string }).intentId;
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    if (intent.providerCheckoutId === null) throw new Error('Synthetic transaction id is missing');
    wompi.setSyntheticTransactionStatus(intent.providerCheckoutId, 'APPROVED');
    const firstRunAt = new Date();
    await expect(
      reconciliation.reconcileStore(organizationId, intent.storeId, firstRunAt),
    ).resolves.toMatchObject({ differences: 2, failed: false, opened: 2, scanned: 1 });
    const issues = await prisma.paymentReconciliationIssue.findMany({
      orderBy: { issueType: 'asc' },
      where: { paymentIntentId: intentId },
    });
    expect(issues.map(({ issueType }) => issueType).sort()).toEqual([
      'INTENT_STATUS_MISMATCH',
      'MISSING_ACCEPTED_EVENT',
    ]);
    expect(
      issues.every(({ detectionCount, status }) => detectionCount === 1 && status === 'OPEN'),
    ).toBe(true);
    await expect(
      reconciliation.reconcileStore(organizationId, intent.storeId, firstRunAt),
    ).resolves.toMatchObject({ skipped: true });
    const secondRunAt = new Date(firstRunAt.getTime() + 24 * 60 * 60 * 1_000 + 1);
    await expect(
      reconciliation.reconcileStore(organizationId, intent.storeId, secondRunAt),
    ).resolves.toMatchObject({ differences: 2, opened: 0, scanned: 1 });
    await expect(
      prisma.paymentReconciliationIssue.findMany({ where: { paymentIntentId: intentId } }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ detectionCount: 2, status: 'OPEN' })]),
    );
    await expect(
      prisma.outboxEvent.count({
        where: {
          aggregateType: 'payment_reconciliation_run',
          eventType: 'payment.reconciliation.differences-detected.v1',
          organizationId,
        },
      }),
    ).resolves.toBe(2);
    const rawBody = await buildEvent('APPROVED', 0, true, targetOrderId);
    await deliverEvent(rawBody).expect(200);
    const thirdRunAt = new Date(secondRunAt.getTime() + 24 * 60 * 60 * 1_000 + 1);
    await expect(
      reconciliation.reconcileStore(organizationId, intent.storeId, thirdRunAt),
    ).resolves.toMatchObject({ differences: 0, resolved: 2, scanned: 1 });
    await expect(
      prisma.paymentReconciliationIssue.count({
        where: { paymentIntentId: intentId, status: 'RESOLVED' },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } }),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('persists a failed report without advancing the successful window and retries safely', async () => {
    const targetOrderId = await seedResolvedCodOrder();
    const response = await createIntent(
      operationsToken,
      `reconciliation-provider-down-${randomUUID()}`,
      organizationId,
      targetOrderId,
    ).expect(201);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: (response.body as { intentId: string }).intentId },
    });
    const failedAt = new Date();
    const alertsBeforeFailure = await prisma.outboxEvent.count({
      where: { aggregateType: 'payment_reconciliation_run', organizationId },
    });
    wompi.setSyntheticAvailability(false);
    try {
      await expect(
        reconciliation.reconcileStore(organizationId, intent.storeId, failedAt),
      ).resolves.toMatchObject({ failed: true, scanned: 1 });
    } finally {
      wompi.setSyntheticAvailability(true);
    }
    const checkpoint = await prisma.paymentReconciliationCheckpoint.findUniqueOrThrow({
      where: { storeId_provider: { provider: 'WOMPI', storeId: intent.storeId } },
    });
    expect(checkpoint.windowEndedAt).toEqual(checkpoint.windowStartedAt);
    expect(checkpoint.consecutiveFailures).toBe(1);
    await expect(
      prisma.paymentReconciliationRun.findFirstOrThrow({ where: { storeId: intent.storeId } }),
    ).resolves.toMatchObject({
      failureCode: 'provider_unavailable',
      status: 'FAILED',
    });
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateType: 'payment_reconciliation_run', organizationId },
      }),
    ).resolves.toBe(alertsBeforeFailure);
    await expect(
      reconciliation.reconcileStore(
        organizationId,
        intent.storeId,
        new Date(checkpoint.nextRunAt.getTime() + 1),
      ),
    ).resolves.toMatchObject({ failed: false, scanned: 1 });
    await expect(
      prisma.paymentReconciliationCheckpoint.findUniqueOrThrow({
        where: { storeId_provider: { provider: 'WOMPI', storeId: intent.storeId } },
      }),
    ).resolves.toMatchObject({ consecutiveFailures: 0, lastFailureAt: null });
  });

  it('keeps financial divergences tenant-safe and never corrects the payment intent', async () => {
    const targetOrderId = await seedResolvedCodOrder(otherOrganizationId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: targetOrderId } });
    const externalReference = `tenant-reconciliation-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const checkout = await wompi.createHostedCheckout({
      amountMinor: Number(order.transportChargeAmount),
      currency: 'COP',
      expiresAt,
      reference: externalReference,
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        amount: order.transportChargeAmount,
        attemptNumber: 1,
        checkoutUrl: checkout.checkoutUrl,
        currency: 'COP',
        expiresAt,
        externalReference,
        idempotencyKey: `tenant-reconciliation-${randomUUID()}`,
        orderId: order.id,
        organizationId: otherOrganizationId,
        provider: 'WOMPI',
        providerCheckoutId: checkout.providerCheckoutId,
        storeId: order.storeId,
      },
    });
    wompi.setSyntheticTransactionSnapshot(checkout.providerCheckoutId, {
      amountMinor: Number(intent.amount) + 1,
    });
    await expect(
      reconciliation.reconcileStore(otherOrganizationId, order.storeId, new Date()),
    ).resolves.toMatchObject({ differences: 1, opened: 1, scanned: 1 });
    await expect(
      prisma.paymentReconciliationIssue.findFirstOrThrow({
        where: { paymentIntentId: intent.id },
      }),
    ).resolves.toMatchObject({
      issueType: 'TRANSACTION_DATA_MISMATCH',
      organizationId: otherOrganizationId,
      status: 'OPEN',
      storeId: order.storeId,
    });
    await expect(
      prisma.paymentReconciliationIssue.count({
        where: { organizationId, paymentIntentId: intent.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    ).resolves.toMatchObject({ amount: 1_200_000n, status: 'PENDING' });
  });
});
