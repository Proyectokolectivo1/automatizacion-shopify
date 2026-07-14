import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

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
import { OutboxPublisherService } from '../src/outbox/outbox-publisher.service';
import { OutboxQueueService } from '../src/outbox/outbox-queue.service';
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
const databaseName = `ecommerce_dlq_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const queueName = `dlq-operations-${suffix}`;
const dlqName = `dlq-archive-${suffix}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);

interface Tokens {
  readonly accessToken: string;
}

interface ReprocessResponse {
  readonly deliveryVersion: number;
  readonly eventId: string;
  readonly reprocessCount: number;
  readonly status: string;
}

interface InspectResponse {
  readonly items: readonly { readonly errorCategory: string | null }[];
  readonly nextCursor: string | null;
}

describe('tenant-safe DLQ operations', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let prisma: PrismaClient;

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

    process.env.POSTGRES_DB = databaseName;
    process.env.OUTBOX_OPERATIONS_ENABLED = 'true';
    process.env.OUTBOX_OPERATIONS_KILL_SWITCH = 'false';
    process.env.OUTBOX_PUBLISHER_ENABLED = 'false';
    process.env.OUTBOX_KILL_SWITCH = 'true';
    process.env.OUTBOX_QUEUE_NAME = queueName;
    process.env.OUTBOX_DLQ_NAME = dlqName;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const [organization, otherOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'DLQ tenant' } }),
      prisma.organization.create({ data: { name: 'Other DLQ tenant' } }),
    ]);
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    const passwordHash = await new PasswordService().hash('Correct-password-123');
    await Promise.all([
      prisma.user.create({
        data: {
          email: 'dlq-owner@example.test',
          memberships: { create: { organizationId, role: 'OWNER' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
      prisma.user.create({
        data: {
          email: 'dlq-reader@example.test',
          memberships: { create: { organizationId, role: 'READ_ONLY' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
    ]);
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    const connection = {
      host: required('REDIS_HOST'),
      password: required('REDIS_PASSWORD'),
      port: Number(required('REDIS_PORT')),
    };
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

  const login = async (email = 'dlq-owner@example.test'): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password: 'Correct-password-123' })
      .expect(200);
    return response.body as Tokens;
  };

  const createEvent = async (
    targetOrganizationId = organizationId,
    status: 'DEAD_LETTER' | 'PENDING' = 'DEAD_LETTER',
    eventType = 'foundation.failure.test',
  ) =>
    prisma.outboxEvent.create({
      data: {
        aggregateId: targetOrganizationId,
        aggregateType: 'organization',
        deadLetteredAt: status === 'DEAD_LETTER' ? new Date() : null,
        eventType,
        lastErrorJson: { category: 'consumer_failure', secret: 'must-not-leak' },
        organizationId: targetOrganizationId,
        payloadJson: { customerEmail: 'private@example.test', schemaVersion: 1 },
        correlationId: randomUUID(),
        status,
      },
    });

  it('paginates and redacts only the authenticated tenant DLQ', async () => {
    const tokens = await login();
    await Promise.all([
      createEvent(organizationId, 'DEAD_LETTER', 'type.one'),
      createEvent(organizationId, 'DEAD_LETTER', 'type.two'),
      createEvent(organizationId, 'DEAD_LETTER', 'type.three'),
      createEvent(otherOrganizationId, 'DEAD_LETTER', 'other.secret'),
    ]);
    const first = await request(baseUrl)
      .get(`/operations/organizations/${organizationId}/dlq?limit=2`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const firstBody = first.body as InspectResponse;
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(first.body)).not.toMatch(
      /payload|customerEmail|must-not-leak|other\.secret/u,
    );
    expect(firstBody.items[0]).toMatchObject({ errorCategory: 'consumer_failure' });
    const second = await request(baseUrl)
      .get(
        `/operations/organizations/${organizationId}/dlq?limit=2&cursor=${encodeURIComponent(String(firstBody.nextCursor))}`,
      )
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const secondBody = second.body as InspectResponse;
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.nextCursor).toBeNull();
  });

  it('denies low roles and cross-tenant routes without leaking events', async () => {
    const [reader, owner] = await Promise.all([login('dlq-reader@example.test'), login()]);
    await request(baseUrl)
      .get(`/operations/organizations/${organizationId}/dlq`)
      .set('authorization', `Bearer ${reader.accessToken}`)
      .expect(403);
    await request(baseUrl)
      .get(`/operations/organizations/${otherOrganizationId}/dlq`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(403);
    expect(
      await prisma.auditLog.count({ where: { action: 'outbox.dlq.access_denied' } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('reprocesses once and returns the same snapshot after a lost response retry', async () => {
    const tokens = await login();
    const event = await createEvent();
    const key = `replay-${randomUUID()}`;
    const responses = await Promise.all([
      request(baseUrl)
        .post(`/operations/organizations/${organizationId}/dlq/${event.id}/reprocess`)
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .set('idempotency-key', key),
      request(baseUrl)
        .post(`/operations/organizations/${organizationId}/dlq/${event.id}/reprocess`)
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .set('idempotency-key', key),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[0]?.body as ReprocessResponse).toMatchObject({
      deliveryVersion: 2,
      eventId: event.id,
      reprocessCount: 1,
      status: 'pending',
    });
    expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      attemptCount: 0,
      deliveryVersion: 2,
      reprocessCount: 1,
      status: 'PENDING',
    });
  });

  it('allows one concurrent operator, rejects invalid states and creates a fresh delivery id', async () => {
    const tokens = await login();
    const event = await createEvent();
    const concurrent = await Promise.all([
      request(baseUrl)
        .post(`/operations/organizations/${organizationId}/dlq/${event.id}/reprocess`)
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .set('idempotency-key', `operator-a-${randomUUID()}`),
      request(baseUrl)
        .post(`/operations/organizations/${organizationId}/dlq/${event.id}/reprocess`)
        .set('authorization', `Bearer ${tokens.accessToken}`)
        .set('idempotency-key', `operator-b-${randomUUID()}`),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([202, 409]);

    const pending = await createEvent(organizationId, 'PENDING');
    await request(baseUrl)
      .post(`/operations/organizations/${organizationId}/dlq/${pending.id}/reprocess`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .set('idempotency-key', `pending-${randomUUID()}`)
      .expect(409);
    const foreign = await createEvent(otherOrganizationId);
    await request(baseUrl)
      .post(`/operations/organizations/${organizationId}/dlq/${foreign.id}/reprocess`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .set('idempotency-key', `foreign-${randomUUID()}`)
      .expect(404);

    process.env.OUTBOX_PUBLISHER_ENABLED = 'true';
    process.env.OUTBOX_KILL_SWITCH = 'false';
    const environment = new EnvironmentService();
    const queue = new OutboxQueueService(environment);
    const publisher = new OutboxPublisherService(
      environment,
      new MetricsService(),
      app?.get(PrismaService) as PrismaService,
      queue,
    );
    const publishedCount = await publisher.publishBatch();
    const inspector = new Queue(queueName, { connection: { ...environment.redis } });
    const replayJob = await inspector.getJob(outboxDeliveryId(event.id, 2));
    if (replayJob === undefined) {
      const appPrisma = app?.get(PrismaService) as PrismaService;
      const [storedEvent, jobs, counts, appEventCount, clock] = await Promise.all([
        prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
        inspector.getJobs(),
        inspector.getJobCounts(),
        appPrisma.outboxEvent.count({ where: { id: event.id } }),
        appPrisma.$queryRaw<
          Array<{ database: string; now: Date }>
        >`SELECT current_database() AS database, NOW() AS now`,
      ]);
      throw new Error(
        `Fresh delivery missing: published=${publishedCount}; appEventCount=${appEventCount}; clock=${JSON.stringify(clock)}; config=${JSON.stringify(environment.outbox)}; event=${JSON.stringify(storedEvent)}; jobs=${JSON.stringify(jobs.map((job) => job.id))}; counts=${JSON.stringify(counts)}`,
      );
    }
    expect(await inspector.getJob(event.id)).toBeUndefined();
    await inspector.close();
    await queue.onModuleDestroy();
  });

  it('exports bounded operational metrics and keeps raw idempotency keys out of storage', async () => {
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_outbox_operations_total');
    const rawKey = `raw-key-${randomUUID()}`;
    const tokens = await login();
    const event = await createEvent();
    await request(baseUrl)
      .post(`/operations/organizations/${organizationId}/dlq/${event.id}/reprocess`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .set('idempotency-key', rawKey)
      .expect(202);
    expect(await prisma.idempotencyKey.count({ where: { key: { contains: rawKey } } })).toBe(0);
  });
});
