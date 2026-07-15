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
import { PaymentReminderSchedulerService } from '../src/payments/payment-reminder-scheduler.service';
import { createWompiEventChecksum } from '../src/payments/wompi-event-signature';
import { WompiMockProvider } from '../src/payments/wompi-mock.provider';

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
  let operationsToken: string;
  let orderId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
  let reminders: PaymentReminderSchedulerService;
  let wompi: WompiMockProvider;
  let eventSequence = 0;

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

  const seedResolvedCodOrder = async (): Promise<string> => {
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Wompi Store',
        organizationId,
        shopifyShopDomain: 'wompi-intents.myshopify.com',
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
        organizationId,
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
        organizationId,
        paymentMode: 'COD',
        rawSnapshotJson: { synthetic: true },
        shopifyOrderId: randomUUID(),
        shopifyOrderName: '#WOMPI-1',
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
        organizationId,
        storeId: store.id,
        version: 1,
      },
    });
    const rule = await prisma.transportRateRule.create({
      data: {
        amount: 1_200_000n,
        organizationId,
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
        organizationId,
        policyId: policy.id,
        ruleId: rule.id,
        storeId: store.id,
      },
    });
    return order.id;
  };

  const createIntent = (token: string, key = `intent-${randomUUID()}`, tenant = organizationId) =>
    request(baseUrl)
      .post(`/operations/organizations/${tenant}/payments/orders/${orderId}/intents`)
      .set('authorization', `Bearer ${token}`)
      .set('idempotency-key', key);

  const buildEvent = async (
    status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'PENDING' | 'VOIDED',
    amountDelta = 0,
    validSignature = true,
  ): Promise<string> => {
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId } });
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
  });
});
