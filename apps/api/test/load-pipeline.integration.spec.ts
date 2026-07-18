import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Queue } from 'bullmq';
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

const ORDER_COUNT = 500;
const BURST_CONCURRENCY = 25;
const REPLAY_COUNT = 50;
const PUBLISHER_COUNT = 4;
const MINIMUM_INGRESS_RPS = 5;
const MAXIMUM_INGRESS_P95_MS = 2_500;
const MINIMUM_DRAIN_ORDERS_PER_SECOND = 2;
const MAXIMUM_DRAIN_MS = 120_000;

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
const databaseName = `ecommerce_load_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const queueSuffix = randomUUID().replaceAll('-', '').slice(0, 16);
const queueName = `load-pipeline-${queueSuffix}`;
const dlqName = `load-pipeline-dlq-${queueSuffix}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = [
  'LOG_LEVEL',
  'NODE_ENV',
  'ORDER_CLASSIFICATION_ENABLED',
  'ORDER_CLASSIFICATION_KILL_SWITCH',
  'ORDER_CLASSIFICATION_SIMULATION_MODE',
  'OUTBOX_BATCH_SIZE',
  'OUTBOX_DLQ_NAME',
  'OUTBOX_KILL_SWITCH',
  'OUTBOX_MAX_ATTEMPTS',
  'OUTBOX_POLL_INTERVAL_MS',
  'OUTBOX_PUBLISHER_ENABLED',
  'OUTBOX_QUEUE_NAME',
  'OUTBOX_RETRY_BASE_MS',
  'OUTBOX_SIMULATION_MODE',
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

interface LoadSample {
  readonly body: Buffer;
  readonly orderId: string;
  readonly webhookId: string;
}

const percentile95 = (values: readonly number[]): number => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0;
};

const runConcurrent = async <T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> => {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) await operation(value);
    }
  });
  await Promise.all(workers);
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds));

describe('E9-H2A local simulated order load and recovery', () => {
  let app: INestApplication | undefined;
  let baseUrl = '';
  let databaseCreated = false;
  let organizationId = '';
  let prisma: PrismaClient | undefined;
  let runtimePrisma: PrismaService | undefined;
  let recoveredEnvironment: EnvironmentService | undefined;
  let recoveredQueue: OutboxQueueService | undefined;
  let worker: OutboxWorkerService | undefined;
  let storeId = '';

  const password = 'Correct-load-password-123';
  const accessToken = 'mock-valid-token-for-load-suite';
  const webhookSecret = 'synthetic-load-webhook-secret-1234567890';

  beforeAll(async () => {
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
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
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      ORDER_CLASSIFICATION_ENABLED: 'true',
      ORDER_CLASSIFICATION_KILL_SWITCH: 'false',
      ORDER_CLASSIFICATION_SIMULATION_MODE: 'true',
      OUTBOX_BATCH_SIZE: '50',
      OUTBOX_DLQ_NAME: dlqName,
      OUTBOX_KILL_SWITCH: 'true',
      OUTBOX_MAX_ATTEMPTS: '2',
      OUTBOX_POLL_INTERVAL_MS: '100',
      OUTBOX_PUBLISHER_ENABLED: 'false',
      OUTBOX_QUEUE_NAME: queueName,
      OUTBOX_RETRY_BASE_MS: '100',
      OUTBOX_SIMULATION_MODE: 'true',
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
    const organization = await prisma.organization.create({ data: { name: 'Load tenant' } });
    organizationId = organization.id;
    const passwordHash = await new PasswordService().hash(password);
    await prisma.user.create({
      data: {
        email: 'load-owner@example.test',
        memberships: { create: { organizationId, role: 'OWNER' } },
        passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
        passwordHash,
        passwordParametersJson: PASSWORD_PARAMETERS,
      },
    });

    app = await createApplication();
    runtimePrisma = app.get(PrismaService);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const loginResponse = await request(baseUrl)
      .post('/auth/login')
      .send({ email: 'load-owner@example.test', organizationId, password })
      .expect(200);
    const owner = loginResponse.body as Tokens;
    const registered = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `register-${randomUUID()}`)
      .send({
        accessToken,
        currency: 'COP',
        displayName: 'Synthetic load connection',
        name: 'Synthetic Load Store',
        shopDomain: 'load-fixture.myshopify.com',
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
  }, 120_000);

  afterAll(async () => {
    await worker?.onModuleDestroy();
    await recoveredQueue?.onModuleDestroy();
    if (recoveredEnvironment !== undefined) {
      const connection = { ...recoveredEnvironment.redis };
      const mainQueue = new Queue(queueName, { connection });
      const deadLetterQueue = new Queue(dlqName, { connection });
      await mainQueue.obliterate({ force: true });
      await deadLetterQueue.obliterate({ force: true });
      await mainQueue.close();
      await deadLetterQueue.close();
    }
    await app?.close();
    await prisma?.$disconnect();

    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    process.env.POSTGRES_DB = originalDatabase;

    if (databaseCreated) {
      const admin = new Client(adminConfig);
      await admin.connect();
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  }, 120_000);

  const deliver = (sample: LoadSample) =>
    request(baseUrl)
      .post(`/webhooks/shopify/${storeId}/orders-create`)
      .set('content-type', 'application/json')
      .set('x-shopify-api-version', '2026-07')
      .set('x-shopify-hmac-sha256', createShopifyWebhookHmac(sample.body, webhookSecret))
      .set('x-shopify-shop-domain', 'load-fixture.myshopify.com')
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-triggered-at', new Date().toISOString())
      .set('x-shopify-webhook-id', sample.webhookId)
      .send(sample.body.toString('utf8'));

  it('ingests 500 orders, drains accumulated work and preserves idempotency under replay', async () => {
    if (prisma === undefined || runtimePrisma === undefined || app === undefined) {
      throw new Error('Load suite was not initialized');
    }
    const samples = Array.from({ length: ORDER_COUNT }, (_, index): LoadSample => {
      const suffix = String(index + 1).padStart(4, '0');
      const orderId = `900000000${suffix}`;
      return {
        body: Buffer.from(
          JSON.stringify({ _fixture: { synthetic: true, version: 'v1' }, id: orderId, test: true }),
          'utf8',
        ),
        orderId,
        webhookId: `load-webhook-${suffix}`,
      };
    });

    const ingressLatencies: number[] = [];
    const ingressStarted = performance.now();
    await runConcurrent(samples, BURST_CONCURRENCY, async (sample) => {
      const requestStarted = performance.now();
      const response = await deliver(sample);
      ingressLatencies.push(performance.now() - requestStarted);
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({ accepted: true, duplicate: false, mode: 'simulation' });
    });
    const ingressDurationMs = performance.now() - ingressStarted;
    const ingressRequestsPerSecond = ORDER_COUNT / (ingressDurationMs / 1_000);
    const ingressP95Ms = percentile95(ingressLatencies);
    expect(ingressRequestsPerSecond).toBeGreaterThanOrEqual(MINIMUM_INGRESS_RPS);
    expect(ingressP95Ms).toBeLessThanOrEqual(MAXIMUM_INGRESS_P95_MS);

    expect(
      await prisma.webhookEvent.count({
        where: { externalEventId: { startsWith: 'load-webhook-' }, storeId },
      }),
    ).toBe(ORDER_COUNT);
    expect(
      await prisma.outboxEvent.count({
        where: {
          eventType: 'shopify.webhook.received.v1',
          organizationId,
          status: 'PENDING',
        },
      }),
    ).toBe(ORDER_COUNT);
    expect(await prisma.order.count({ where: { organizationId } })).toBe(0);

    Object.assign(process.env, {
      OUTBOX_KILL_SWITCH: 'false',
      OUTBOX_PUBLISHER_ENABLED: 'true',
    });
    const recoveryEnvironment = new EnvironmentService();
    const recoveryQueue = new OutboxQueueService(recoveryEnvironment);
    const activePrisma = runtimePrisma;
    recoveredEnvironment = recoveryEnvironment;
    recoveredQueue = recoveryQueue;
    const publishers = Array.from(
      { length: PUBLISHER_COUNT },
      () =>
        new OutboxPublisherService(
          recoveryEnvironment,
          new MetricsService(),
          activePrisma,
          recoveryQueue,
        ),
    );
    worker = new OutboxWorkerService(
      recoveryEnvironment,
      activePrisma,
      app.get(ShopifyOrderSyncService),
      app.get(OrderClassificationService),
    );
    worker.onModuleInit();

    const drainStarted = performance.now();
    const drainDeadline = Date.now() + MAXIMUM_DRAIN_MS;
    let completedOrders = 0;
    let outstandingEvents = ORDER_COUNT;
    while (Date.now() < drainDeadline) {
      await Promise.all(publishers.map((publisher) => publisher.publishBatch()));
      [completedOrders, outstandingEvents] = await Promise.all([
        prisma.order.count({
          where: { currentState: 'READY_FOR_LOGISTICS', organizationId },
        }),
        prisma.outboxEvent.count({
          where: {
            organizationId,
            status: { in: ['FAILED', 'PENDING', 'PROCESSING'] },
          },
        }),
      ]);
      if (completedOrders === ORDER_COUNT && outstandingEvents === 0) break;
      await delay(25);
    }
    const drainDurationMs = performance.now() - drainStarted;
    const drainOrdersPerSecond = ORDER_COUNT / (drainDurationMs / 1_000);
    if (completedOrders !== ORDER_COUNT) {
      const diagnosticQueue = new Queue(queueName, {
        connection: { ...recoveryEnvironment.redis },
      });
      const [orders, outbox, jobs, webhooks, failedJobs] = await Promise.all([
        prisma.order.groupBy({ by: ['currentState'], _count: true, where: { organizationId } }),
        prisma.outboxEvent.groupBy({ by: ['status'], _count: true, where: { organizationId } }),
        prisma.jobExecution.groupBy({ by: ['status'], _count: true, where: { organizationId } }),
        prisma.webhookEvent.groupBy({ by: ['status'], _count: true, where: { organizationId } }),
        diagnosticQueue.getFailed(0, 4),
      ]);
      await diagnosticQueue.close();
      console.error(
        `[load] timeout diagnostic orders=${JSON.stringify(orders)} outbox=${JSON.stringify(outbox)} ` +
          `jobs=${JSON.stringify(jobs)} webhooks=${JSON.stringify(webhooks)} ` +
          `failedReasons=${JSON.stringify(failedJobs.map((job) => job.failedReason))}`,
      );
    }
    expect(completedOrders).toBe(ORDER_COUNT);
    expect(outstandingEvents).toBe(0);
    expect(drainDurationMs).toBeLessThanOrEqual(MAXIMUM_DRAIN_MS);
    expect(drainOrdersPerSecond).toBeGreaterThanOrEqual(MINIMUM_DRAIN_ORDERS_PER_SECOND);
    expect(await prisma.orderStateHistory.count({ where: { organizationId } })).toBe(
      ORDER_COUNT * 3,
    );
    expect(
      await prisma.outboxEvent.count({
        where: {
          organizationId,
          status: { in: ['DEAD_LETTER', 'FAILED', 'PENDING', 'PROCESSING'] },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.jobExecution.count({
        where: { organizationId, status: { in: ['DEAD_LETTER', 'FAILED'] } },
      }),
    ).toBe(0);

    const replaySamples = samples.slice(0, REPLAY_COUNT);
    await runConcurrent(replaySamples, BURST_CONCURRENCY, async (sample) => {
      const response = await deliver(sample);
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({ accepted: true, duplicate: true, mode: 'simulation' });
    });
    expect(await prisma.order.count({ where: { organizationId } })).toBe(ORDER_COUNT);
    expect(
      await prisma.webhookEvent.count({
        where: { externalEventId: { startsWith: 'load-webhook-' }, storeId },
      }),
    ).toBe(ORDER_COUNT);

    const report = {
      schemaVersion: 1,
      outcome: 'passed',
      scope: 'local-simulation-only',
      workload: {
        orders: ORDER_COUNT,
        burstConcurrency: BURST_CONCURRENCY,
        publishers: PUBLISHER_COUNT,
        replayedDeliveries: REPLAY_COUNT,
      },
      ingress: {
        durationMs: Math.round(ingressDurationMs),
        p95Ms: Math.round(ingressP95Ms),
        requestsPerSecond: Number(ingressRequestsPerSecond.toFixed(2)),
      },
      recovery: {
        drainDurationMs: Math.round(drainDurationMs),
        ordersPerSecond: Number(drainOrdersPerSecond.toFixed(2)),
      },
      final: {
        completedOrders,
        deadLetters: 0,
        errors: 0,
      },
    };
    const reportDirectory = resolve(process.cwd(), '..', '..', '.artifacts', 'load');
    mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
    const reportPath = resolve(reportDirectory, `e9-h2a-${Date.now()}.json`);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      `[load] OK: ingress ${report.ingress.requestsPerSecond} req/s p95 ${report.ingress.p95Ms} ms; ` +
        `drain ${report.recovery.ordersPerSecond} pedidos/s en ${report.recovery.drainDurationMs} ms`,
    );
  }, 180_000);
});
