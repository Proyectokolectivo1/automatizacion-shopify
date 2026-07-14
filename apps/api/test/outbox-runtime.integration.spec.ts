import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { Queue } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaService } from '../src/database/prisma.service';
import { FoundationTransactionService } from '../src/foundation/foundation-transaction.service';
import { MetricsService } from '../src/observability/metrics.service';
import { OutboxPublisherService } from '../src/outbox/outbox-publisher.service';
import { OutboxQueueService } from '../src/outbox/outbox-queue.service';
import { OutboxWorkerService } from '../src/outbox/outbox-worker.service';
import { outboxDeliveryId } from '../src/outbox/outbox.types';

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
const databaseName = `ecommerce_outbox_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const queueName = `foundation-${suffix}`;
const dlqName = `dead-letter-${suffix}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const runPrisma = (...arguments_: string[]): void => {
  execFileSync(process.execPath, [prismaCli, ...arguments_, '--config', 'prisma.config.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
};
const waitUntil = async (condition: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error('Condition was not met before timeout');
};

describe('transactional outbox runtime', () => {
  let environment: EnvironmentService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.end();
    runPrisma('migrate', 'deploy');

    process.env.POSTGRES_DB = databaseName;
    process.env.OUTBOX_PUBLISHER_ENABLED = 'true';
    process.env.OUTBOX_KILL_SWITCH = 'false';
    process.env.OUTBOX_SIMULATION_MODE = 'true';
    process.env.OUTBOX_QUEUE_NAME = queueName;
    process.env.OUTBOX_DLQ_NAME = dlqName;
    process.env.OUTBOX_MAX_ATTEMPTS = '2';
    process.env.OUTBOX_RETRY_BASE_MS = '100';
    environment = new EnvironmentService();
    prisma = new PrismaService(environment);
    await prisma.$connect();
  });

  afterAll(async () => {
    const redis = environment.redis;
    const connection = { host: redis.host, password: redis.password, port: redis.port };
    const mainQueue = new Queue(queueName, { connection });
    const deadLetterQueue = new Queue(dlqName, { connection });
    await mainQueue.obliterate({ force: true });
    await deadLetterQueue.obliterate({ force: true });
    await mainQueue.close();
    await deadLetterQueue.close();
    await prisma.$disconnect();
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

  it('commits aggregate, idempotency snapshot and event atomically', async () => {
    const service = new FoundationTransactionService(prisma);
    const command = {
      correlationId: randomUUID(),
      currency: 'COP',
      idempotencyKey: randomUUID(),
      name: 'Atomic foundation',
      timezone: 'America/Bogota',
    };
    const [first, concurrentReplay] = await Promise.all([
      service.execute(command),
      service.execute(command),
    ]);
    expect(first.organizationId).toBe(concurrentReplay.organizationId);
    expect(await prisma.organization.count({ where: { id: first.organizationId } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: first.organizationId } })).toBe(
      1,
    );
    await expect(service.execute({ ...command, name: 'Different request' })).rejects.toMatchObject({
      status: 409,
    });

    const before = await prisma.organization.count();
    await expect(
      service.execute({ ...command, currency: 'cop', idempotencyKey: randomUUID() }),
    ).rejects.toBeDefined();
    expect(await prisma.organization.count()).toBe(before);
  });

  it('claims concurrently without creating duplicate queue jobs', async () => {
    const aggregate = await prisma.organization.create({ data: { name: 'Concurrent claim' } });
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateId: aggregate.id,
        aggregateType: 'organization',
        availableAt: new Date(0),
        correlationId: randomUUID(),
        eventType: 'foundation.claim.test',
        organizationId: aggregate.id,
        payloadJson: { schemaVersion: 1 },
      },
    });
    const queueA = new OutboxQueueService(environment);
    const queueB = new OutboxQueueService(environment);
    const publisherA = new OutboxPublisherService(
      environment,
      new MetricsService(),
      prisma,
      queueA,
    );
    const publisherB = new OutboxPublisherService(
      environment,
      new MetricsService(),
      prisma,
      queueB,
    );
    await Promise.all([publisherA.publishBatch(), publisherB.publishBatch()]);

    const inspector = new Queue(queueName, {
      connection: { ...environment.redis },
    });
    expect(await inspector.getJob(outboxDeliveryId(event.id, 1))).not.toBeUndefined();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'PUBLISHED',
    );
    await inspector.close();
    await queueA.onModuleDestroy();
    await queueB.onModuleDestroy();
  });

  it('fails fast while Redis is unreachable and publishes after recovery', async () => {
    const aggregate = await prisma.organization.create({ data: { name: 'Recovery' } });
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateId: aggregate.id,
        aggregateType: 'organization',
        availableAt: new Date(0),
        correlationId: randomUUID(),
        eventType: 'foundation.recovery.test',
        organizationId: aggregate.id,
        payloadJson: { schemaVersion: 1 },
      },
    });
    const realPort = process.env.REDIS_PORT;
    process.env.REDIS_PORT = '6399';
    const unavailableEnvironment = new EnvironmentService();
    const unavailableQueue = new OutboxQueueService(unavailableEnvironment);
    const unavailablePublisher = new OutboxPublisherService(
      unavailableEnvironment,
      new MetricsService(),
      prisma,
      unavailableQueue,
    );
    let unavailableStatus: string;
    try {
      await unavailablePublisher.publishBatch();
      unavailableStatus = (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }))
        .status;
    } finally {
      await unavailableQueue.onModuleDestroy();
      process.env.REDIS_PORT = realPort;
    }
    expect(unavailableStatus).toBe('FAILED');
    await prisma.outboxEvent.update({
      data: { availableAt: new Date(0) },
      where: { id: event.id },
    });
    const recoveredQueue = new OutboxQueueService(environment);
    const recoveredPublisher = new OutboxPublisherService(
      environment,
      new MetricsService(),
      prisma,
      recoveredQueue,
    );
    await recoveredPublisher.publishBatch();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'PUBLISHED',
    );
    await recoveredQueue.onModuleDestroy();
  });

  it('retries consumer failures and moves the final failure to the DLQ', async () => {
    const aggregate = await prisma.organization.create({ data: { name: 'DLQ' } });
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateId: aggregate.id,
        aggregateType: 'organization',
        availableAt: new Date(0),
        correlationId: randomUUID(),
        eventType: 'foundation.failure.test',
        organizationId: aggregate.id,
        payloadJson: { simulateFailure: true },
      },
    });
    const queue = new OutboxQueueService(environment);
    const publisher = new OutboxPublisherService(environment, new MetricsService(), prisma, queue);
    await publisher.publishBatch();
    const worker = new OutboxWorkerService(environment, prisma);
    worker.onModuleInit();
    try {
      await waitUntil(async () => {
        const execution = await prisma.jobExecution.findUnique({
          where: { queueName_jobId: { jobId: outboxDeliveryId(event.id, 1), queueName } },
        });
        return execution?.status === 'DEAD_LETTER';
      });
    } catch (error) {
      const diagnosticQueue = new Queue(queueName, { connection: { ...environment.redis } });
      const [execution, job, counts] = await Promise.all([
        prisma.jobExecution.findMany({ where: { eventId: event.id } }),
        diagnosticQueue.getJob(outboxDeliveryId(event.id, 1)),
        diagnosticQueue.getJobCounts(),
      ]);
      await diagnosticQueue.close();
      throw new Error(
        `DLQ wait failed: ${String(error)}; executions=${JSON.stringify(execution)}; job=${JSON.stringify(job?.toJSON())}; counts=${JSON.stringify(counts)}`,
      );
    }
    const dlq = new Queue(dlqName, { connection: { ...environment.redis } });
    expect(await dlq.getJob(outboxDeliveryId(event.id, 1))).not.toBeUndefined();
    expect(
      (
        await prisma.jobExecution.findFirstOrThrow({
          where: { jobId: outboxDeliveryId(event.id, 1) },
        })
      ).attempt,
    ).toBe(2);
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      organizationId: aggregate.id,
      status: 'DEAD_LETTER',
    });
    await worker.onModuleDestroy();
    await dlq.close();
    await queue.onModuleDestroy();
  });
});
