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
const databaseName = `ecommerce_whatsapp_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const password = 'Correct-password-123';
const initialToken = 'mock-whatsapp-valid-initial-token';
const rotatedToken = 'mock-whatsapp-valid-rotated-token';
const environmentNames = [
  'WHATSAPP_CREDENTIAL_KEYS_JSON',
  'WHATSAPP_CREDENTIAL_KEY_VERSION',
  'WHATSAPP_INTEGRATIONS_ENABLED',
  'WHATSAPP_INTEGRATIONS_KILL_SWITCH',
  'WHATSAPP_SIMULATION_MODE',
  'WHATSAPP_TEMPLATES_ENABLED',
  'WHATSAPP_TEMPLATES_KILL_SWITCH',
  'WHATSAPP_TEMPLATES_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

interface Tokens {
  readonly accessToken: string;
}

interface ConnectionResponse {
  readonly connectionId: string;
  readonly health: string;
  readonly mode: string;
  readonly status: string;
  readonly storeId: string;
}

interface TemplateResponse {
  readonly active: boolean;
  readonly mode: string;
  readonly status: string;
  readonly templateId: string;
  readonly templateKey: string;
  readonly version: number;
}

interface TemplateListResponse {
  readonly items: readonly TemplateResponse[];
  readonly mode: string;
  readonly nextCursor: string | null;
}

describe('tenant-safe WhatsApp integration registry in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let storeId: string;
  let secondStoreId: string;
  let foreignStoreId: string;
  let connectionId: string;
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
    process.env.WHATSAPP_INTEGRATIONS_ENABLED = 'true';
    process.env.WHATSAPP_INTEGRATIONS_KILL_SWITCH = 'false';
    process.env.WHATSAPP_SIMULATION_MODE = 'true';
    process.env.WHATSAPP_TEMPLATES_ENABLED = 'true';
    process.env.WHATSAPP_TEMPLATES_KILL_SWITCH = 'false';
    process.env.WHATSAPP_TEMPLATES_SIMULATION_MODE = 'true';
    process.env.WHATSAPP_CREDENTIAL_KEY_VERSION = 'v1';
    process.env.WHATSAPP_CREDENTIAL_KEYS_JSON = JSON.stringify({
      v1: randomBytes(32).toString('base64url'),
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const [organization, otherOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'WhatsApp tenant' } }),
      prisma.organization.create({ data: { name: 'Foreign WhatsApp tenant' } }),
    ]);
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    const createStore = async (targetOrganizationId: string, label: string) =>
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
    const [store, secondStore, foreignStore] = await Promise.all([
      createStore(organizationId, 'whatsapp-main'),
      createStore(organizationId, 'whatsapp-second'),
      createStore(otherOrganizationId, 'whatsapp-foreign'),
    ]);
    storeId = store.id;
    secondStoreId = secondStore.id;
    foreignStoreId = foreignStore.id;

    const passwordHash = await new PasswordService().hash(password);
    const createUser = (
      email: string,
      role: 'OWNER' | 'ADMIN' | 'READ_ONLY',
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
    await Promise.all([
      createUser('whatsapp-owner@example.test', 'OWNER'),
      createUser('whatsapp-admin@example.test', 'ADMIN'),
      createUser('whatsapp-reader@example.test', 'READ_ONLY'),
      createUser('whatsapp-foreign@example.test', 'OWNER', otherOrganizationId),
    ]);

    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    process.env.POSTGRES_DB = originalDatabase;
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  });

  const login = async (
    email = 'whatsapp-owner@example.test',
    targetOrganizationId = organizationId,
  ): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId: targetOrganizationId, password })
      .expect(200);
    return response.body as Tokens;
  };

  const configuration = (accessToken = initialToken, phoneNumberId = 'mock_phone_primary') => ({
    accessToken,
    apiVersion: 'v99.0',
    businessAccountId: 'mock_waba_primary',
    displayName: 'WhatsApp simulated connection',
    phoneNumberId,
  });

  const endpoint = (targetStoreId = storeId, targetOrganizationId = organizationId) =>
    `/integrations/organizations/${targetOrganizationId}/whatsapp/stores/${targetStoreId}`;

  const templateEndpoint = (targetStoreId = storeId, targetOrganizationId = organizationId) =>
    `${endpoint(targetStoreId, targetOrganizationId)}/templates`;

  const templatePayload = () => ({
    bodyTemplate: 'Hola {{customer_name}}, paga el transporte en {{checkout_url}}.',
    category: 'UTILITY',
    eventType: 'payment.transport.pending',
    languageCode: 'es_CO',
    metaTemplateName: 'transport_payment_pending',
    name: 'transport_payment_pending',
    variablesSchema: {
      variables: [
        { maxLength: 120, name: 'customer_name', required: true, type: 'TEXT' },
        { maxLength: 2048, name: 'checkout_url', required: true, type: 'URL' },
      ],
      version: 'v1',
    },
  });

  it('configures once under concurrency and never persists the plaintext token', async () => {
    const owner = await login();
    const key = `configure-${randomUUID()}`;
    const responses = await Promise.all([
      request(baseUrl)
        .post(endpoint())
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(configuration()),
      request(baseUrl)
        .post(endpoint())
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(configuration()),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    const body = responses[0]?.body as ConnectionResponse;
    expect(body).toMatchObject({
      health: 'unknown',
      mode: 'simulation',
      status: 'pending',
      storeId,
    });
    connectionId = body.connectionId;
    expect(
      await prisma.integrationConnection.count({
        where: { organizationId, provider: 'WHATSAPP', storeId },
      }),
    ).toBe(1);
    const connection = await prisma.integrationConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(JSON.stringify(connection)).not.toContain(initialToken);
    expect(connection.encryptedCredentialsJson).toMatchObject({ version: 'v1' });
    expect(connection.configJson).toMatchObject({
      apiVersion: 'v99.0',
      businessAccountId: 'mock_waba_primary',
      fixtureVersion: 'v1',
      mode: 'simulation',
      phoneNumberId: 'mock_phone_primary',
    });
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: connectionId, eventType: 'whatsapp.connection.configured.v1' },
      }),
    ).toBe(1);

    await request(baseUrl)
      .post(endpoint(secondStoreId))
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `duplicate-phone-${randomUUID()}`)
      .send(configuration('another-valid-whatsapp-token'))
      .expect(409);
  });

  it('enforces RBAC, route tenant and non-disclosing foreign lookup', async () => {
    const [owner, reader, foreign] = await Promise.all([
      login(),
      login('whatsapp-reader@example.test'),
      login('whatsapp-foreign@example.test', otherOrganizationId),
    ]);
    await request(baseUrl)
      .post(endpoint(secondStoreId))
      .set('authorization', `Bearer ${reader.accessToken}`)
      .set('idempotency-key', `reader-${randomUUID()}`)
      .send(configuration(initialToken, 'mock_phone_reader'))
      .expect(403);
    await request(baseUrl)
      .post(endpoint(foreignStoreId, otherOrganizationId))
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `cross-${randomUUID()}`)
      .send(configuration(initialToken, 'mock_phone_cross'))
      .expect(403);
    await request(baseUrl)
      .post(endpoint(foreignStoreId, otherOrganizationId))
      .set('authorization', `Bearer ${foreign.accessToken}`)
      .set('idempotency-key', `foreign-${randomUUID()}`)
      .send({
        ...configuration(initialToken, 'mock_phone_foreign'),
        businessAccountId: 'mock_waba_foreign',
      })
      .expect(201);
    await request(baseUrl)
      .post(`${endpoint(foreignStoreId)}/test`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `hidden-${randomUUID()}`)
      .expect(404);
  });

  it('requires a healthy probe and transitions without changing the store status', async () => {
    const admin = await login('whatsapp-admin@example.test');
    await request(baseUrl)
      .post(`${endpoint()}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', `early-${randomUUID()}`)
      .expect(409);

    const testKey = `test-${randomUUID()}`;
    const firstTest = await request(baseUrl)
      .post(`${endpoint()}/test`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', testKey)
      .expect(200);
    const replayedTest = await request(baseUrl)
      .post(`${endpoint()}/test`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', testKey)
      .expect(200);
    expect(firstTest.body).toEqual(replayedTest.body);
    expect(firstTest.body).toMatchObject({ health: 'healthy', status: 'tested' });

    const activateKey = `activate-${randomUUID()}`;
    const activated = await request(baseUrl)
      .post(`${endpoint()}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', activateKey)
      .expect(200);
    const replayed = await request(baseUrl)
      .post(`${endpoint()}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', activateKey)
      .expect(200);
    expect(activated.body).toEqual(replayed.body);
    expect(activated.body).toMatchObject({ health: 'healthy', status: 'active' });

    await request(baseUrl)
      .post(`${endpoint()}/deactivate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', `deactivate-${randomUUID()}`)
      .expect(200)
      .expect(({ body }: { body: ConnectionResponse }) => {
        expect(body).toMatchObject({ status: 'disabled' });
      });
    await expect(prisma.store.findUniqueOrThrow({ where: { id: storeId } })).resolves.toMatchObject(
      { status: 'ACTIVE' },
    );
  });

  it('rotates once under concurrency and records bounded audit, metrics and outbox evidence', async () => {
    const owner = await login();
    const before = await prisma.integrationConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    const rotationKey = `rotate-${randomUUID()}`;
    const rotations = await Promise.all([
      request(baseUrl)
        .patch(`${endpoint()}/credentials`)
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', rotationKey)
        .send({ accessToken: rotatedToken }),
      request(baseUrl)
        .patch(`${endpoint()}/credentials`)
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', rotationKey)
        .send({ accessToken: rotatedToken }),
    ]);
    expect(rotations.map(({ status }) => status)).toEqual([200, 200]);
    expect(rotations[0]?.body).toEqual(rotations[1]?.body);
    const after = await prisma.integrationConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    expect(after.encryptedCredentialsJson).not.toEqual(before.encryptedCredentialsJson);
    expect(after).toMatchObject({
      lastHealthCheckAt: null,
      lastHealthStatus: 'UNKNOWN',
      status: 'PENDING',
    });
    expect(JSON.stringify(after)).not.toContain(rotatedToken);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: connectionId,
          eventType: 'whatsapp.connection.credentials-rotated.v1',
        },
      }),
    ).toBe(1);

    await request(baseUrl)
      .patch(`${endpoint()}/credentials`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-rotate-${randomUUID()}`)
      .send({ accessToken: 'mock-whatsapp-invalid-token' })
      .expect(200);
    await request(baseUrl)
      .post(`${endpoint()}/test`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-test-${randomUUID()}`)
      .expect(200)
      .expect(({ body }: { body: ConnectionResponse }) => {
        expect(body).toMatchObject({ health: 'unhealthy', status: 'error' });
      });
    await request(baseUrl)
      .post(`${endpoint()}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-activate-${randomUUID()}`)
      .expect(409);

    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_whatsapp_operations_total');
    const audit = JSON.stringify(
      await prisma.auditLog.findMany({ where: { action: { startsWith: 'whatsapp.' } } }),
    );
    expect(audit).not.toContain(initialToken);
    expect(audit).not.toContain(rotatedToken);
    expect(audit).not.toContain(rotationKey);
  });

  it('creates one local draft under concurrency and rejects invalid or unauthorized content', async () => {
    const [owner, reader] = await Promise.all([login(), login('whatsapp-reader@example.test')]);
    const key = `template-create-${randomUUID()}`;
    const responses = await Promise.all([
      request(baseUrl)
        .post(templateEndpoint())
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(templatePayload()),
      request(baseUrl)
        .post(templateEndpoint())
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(templatePayload()),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[0]?.body).toMatchObject({
      active: false,
      mode: 'simulation',
      status: 'local_draft',
      version: 1,
    });
    expect(await prisma.whatsAppTemplate.count({ where: { organizationId, storeId } })).toBe(1);

    await request(baseUrl)
      .post(templateEndpoint())
      .set('authorization', `Bearer ${reader.accessToken}`)
      .set('idempotency-key', `reader-template-${randomUUID()}`)
      .send(templatePayload())
      .expect(403);
    await request(baseUrl)
      .post(templateEndpoint())
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `invalid-template-${randomUUID()}`)
      .send({ ...templatePayload(), bodyTemplate: 'Hola {{missing_variable}}' })
      .expect(400);
    await request(baseUrl)
      .get(templateEndpoint(foreignStoreId))
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('requires simulated review, versions immutably and atomically swaps the active version', async () => {
    const owner = await login();
    const first = await prisma.whatsAppTemplate.findFirstOrThrow({
      where: { organizationId, storeId },
    });
    await request(baseUrl)
      .post(`${templateEndpoint()}/${first.id}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `early-template-${randomUUID()}`)
      .expect(409);

    const reviewKey = `review-template-${randomUUID()}`;
    const approved = await request(baseUrl)
      .post(`${templateEndpoint()}/${first.id}/review`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', reviewKey)
      .send({ decision: 'APPROVE' })
      .expect(200);
    const replay = await request(baseUrl)
      .post(`${templateEndpoint()}/${first.id}/review`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', reviewKey)
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(approved.body).toEqual(replay.body);
    expect(approved.body).toMatchObject({ status: 'simulated_approved' });

    await request(baseUrl)
      .post(`${templateEndpoint()}/${first.id}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `activate-template-${randomUUID()}`)
      .expect(200);

    const version = await request(baseUrl)
      .post(`${templateEndpoint()}/${first.templateKey}/versions`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `version-template-${randomUUID()}`)
      .send({
        bodyTemplate: 'Hola {{customer_name}}, usa el enlace seguro {{checkout_url}}.',
        category: 'UTILITY',
        metaTemplateName: 'transport_payment_pending_v2',
        variablesSchema: templatePayload().variablesSchema,
      })
      .expect(201);
    const versionBody = version.body as TemplateResponse;
    expect(versionBody).toMatchObject({ status: 'local_draft', version: 2 });
    expect(versionBody.templateKey).toBe(first.templateKey);

    await request(baseUrl)
      .post(`${templateEndpoint()}/${versionBody.templateId}/review`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `review-v2-${randomUUID()}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    await request(baseUrl)
      .post(`${templateEndpoint()}/${versionBody.templateId}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `activate-v2-${randomUUID()}`)
      .expect(200);
    const versions = await prisma.whatsAppTemplate.findMany({
      orderBy: { version: 'asc' },
      where: { templateKey: first.templateKey },
    });
    expect(versions.map(({ active, version: number }) => ({ active, version: number }))).toEqual([
      { active: false, version: 1 },
      { active: true, version: 2 },
    ]);
    await expect(
      prisma.whatsAppTemplate.update({
        data: { bodyTemplate: 'forbidden mutation' },
        where: { id: first.id },
      }),
    ).rejects.toThrow();
    await expect(prisma.store.findUniqueOrThrow({ where: { id: storeId } })).resolves.toMatchObject(
      { status: 'ACTIVE' },
    );
  });

  it('lists tenant templates and emits bounded audit, outbox and metric evidence', async () => {
    const owner = await login();
    const list = await request(baseUrl)
      .get(`${templateEndpoint()}?limit=1`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const listBody = list.body as TemplateListResponse;
    expect(listBody).toMatchObject({ mode: 'simulation' });
    expect(listBody.items).toHaveLength(1);
    expect(listBody.nextCursor).toEqual(expect.any(String));
    const next = await request(baseUrl)
      .get(`${templateEndpoint()}?limit=10&cursor=${String(listBody.nextCursor)}`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect((next.body as TemplateListResponse).items).toHaveLength(1);

    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_whatsapp_template_operations_total');
    const templates = await prisma.whatsAppTemplate.findMany({
      where: { organizationId, storeId },
    });
    const outbox = JSON.stringify(
      await prisma.outboxEvent.findMany({ where: { aggregateType: 'whatsapp_template' } }),
    );
    const audit = JSON.stringify(
      await prisma.auditLog.findMany({ where: { resourceType: 'whatsapp_template' } }),
    );
    for (const template of templates) {
      expect(outbox).not.toContain(template.bodyTemplate);
      expect(audit).not.toContain(template.bodyTemplate);
    }
  });
});
