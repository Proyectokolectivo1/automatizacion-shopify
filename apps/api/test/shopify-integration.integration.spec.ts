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
const databaseName = `ecommerce_shopify_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const password = 'Correct-password-123';
const initialToken = 'mock-valid-token-initial-value';
const rotatedToken = 'mock-valid-token-rotated-value';
const environmentNames = [
  'SHOPIFY_CREDENTIAL_KEYS_JSON',
  'SHOPIFY_CREDENTIAL_KEY_VERSION',
  'SHOPIFY_INTEGRATIONS_ENABLED',
  'SHOPIFY_INTEGRATIONS_KILL_SWITCH',
  'SHOPIFY_SIMULATION_MODE',
] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);

interface Tokens {
  readonly accessToken: string;
}

interface StoreResponse {
  readonly health: string;
  readonly mode: string;
  readonly shopDomain: string;
  readonly status: string;
  readonly storeId: string;
}

describe('tenant-safe Shopify integration registry in simulation mode', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let storeId: string;
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
    process.env.SHOPIFY_INTEGRATIONS_ENABLED = 'true';
    process.env.SHOPIFY_INTEGRATIONS_KILL_SWITCH = 'false';
    process.env.SHOPIFY_SIMULATION_MODE = 'true';
    process.env.SHOPIFY_CREDENTIAL_KEY_VERSION = 'v1';
    process.env.SHOPIFY_CREDENTIAL_KEYS_JSON = JSON.stringify({
      v1: randomBytes(32).toString('base64url'),
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const [organization, otherOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'Shopify tenant' } }),
      prisma.organization.create({ data: { name: 'Foreign Shopify tenant' } }),
    ]);
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
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
      createUser('shopify-owner@example.test', 'OWNER'),
      createUser('shopify-admin@example.test', 'ADMIN'),
      createUser('shopify-reader@example.test', 'READ_ONLY'),
      createUser('shopify-foreign@example.test', 'OWNER', otherOrganizationId),
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
    email = 'shopify-owner@example.test',
    targetOrganizationId = organizationId,
  ): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId: targetOrganizationId, password })
      .expect(200);
    return response.body as Tokens;
  };

  const registration = (accessToken = initialToken, shopDomain = 'SAFE-STORE.MyShopify.Com.') => ({
    accessToken,
    currency: 'COP',
    displayName: 'Shopify simulated connection',
    name: 'Safe Shopify Store',
    shopDomain,
    timezone: 'America/Bogota',
  });

  it('registers once under concurrency, normalizes domain and never persists plaintext', async () => {
    const owner = await login();
    const key = `register-${randomUUID()}`;
    const responses = await Promise.all([
      request(baseUrl)
        .post(`/integrations/organizations/${organizationId}/shopify/stores`)
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(registration()),
      request(baseUrl)
        .post(`/integrations/organizations/${organizationId}/shopify/stores`)
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', key)
        .send(registration()),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    const body = responses[0]?.body as StoreResponse;
    expect(body).toMatchObject({
      health: 'unknown',
      mode: 'simulation',
      shopDomain: 'safe-store.myshopify.com',
      status: 'pending',
    });
    storeId = body.storeId;
    expect(await prisma.store.count({ where: { organizationId } })).toBe(1);
    const connection = await prisma.integrationConnection.findFirstOrThrow({
      where: { organizationId, storeId },
    });
    const persisted = JSON.stringify(connection);
    expect(persisted).not.toContain(initialToken);
    expect(connection.encryptedCredentialsJson).toMatchObject({ version: 'v1' });
    expect(await prisma.idempotencyKey.count({ where: { key: { contains: key } } })).toBe(0);

    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `duplicate-${randomUUID()}`)
      .send(registration('another-valid-token-value'))
      .expect(409);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `ssrf-${randomUUID()}`)
      .send(registration(initialToken, 'https://127.0.0.1/admin'))
      .expect(400);
  });

  it('enforces RBAC, route tenant and non-disclosing foreign lookup', async () => {
    const [owner, reader, foreign] = await Promise.all([
      login(),
      login('shopify-reader@example.test'),
      login('shopify-foreign@example.test', otherOrganizationId),
    ]);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores`)
      .set('authorization', `Bearer ${reader.accessToken}`)
      .set('idempotency-key', `reader-${randomUUID()}`)
      .send(registration(initialToken, 'reader.myshopify.com'))
      .expect(403);
    await request(baseUrl)
      .post(`/integrations/organizations/${otherOrganizationId}/shopify/stores`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `cross-${randomUUID()}`)
      .send(registration(initialToken, 'cross.myshopify.com'))
      .expect(403);
    const foreignRegistration = await request(baseUrl)
      .post(`/integrations/organizations/${otherOrganizationId}/shopify/stores`)
      .set('authorization', `Bearer ${foreign.accessToken}`)
      .set('idempotency-key', `foreign-${randomUUID()}`)
      .send(registration(initialToken, 'foreign.myshopify.com'))
      .expect(201);
    const foreignStore = foreignRegistration.body as StoreResponse;
    await request(baseUrl)
      .post(
        `/integrations/organizations/${organizationId}/shopify/stores/${foreignStore.storeId}/test`,
      )
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `hidden-${randomUUID()}`)
      .expect(404);
  });

  it('requires a healthy probe and transitions through tested, active and disabled exactly once', async () => {
    const admin = await login('shopify-admin@example.test');
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', `early-${randomUUID()}`)
      .expect(409);

    const testKey = `test-${randomUUID()}`;
    const firstTest = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/test`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', testKey)
      .expect(200);
    const replayedTest = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/test`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', testKey)
      .expect(200);
    expect(firstTest.body).toEqual(replayedTest.body);
    expect(firstTest.body).toMatchObject({ health: 'healthy', status: 'tested' });

    const activateKey = `activate-${randomUUID()}`;
    const activated = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', activateKey)
      .expect(200);
    const replayedActivation = await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', activateKey)
      .expect(200);
    expect(activated.body).toEqual(replayedActivation.body);
    expect(activated.body).toMatchObject({ health: 'healthy', status: 'active' });

    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/deactivate`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', `deactivate-${randomUUID()}`)
      .expect(200);
    await expect(prisma.store.findUniqueOrThrow({ where: { id: storeId } })).resolves.toMatchObject(
      { status: 'DISCONNECTED' },
    );
    await expect(
      prisma.integrationConnection.findFirstOrThrow({ where: { storeId } }),
    ).resolves.toMatchObject({ status: 'DISABLED' });
  });

  it('rotates encrypted credentials, fails a deterministic bad probe and emits bounded evidence', async () => {
    const owner = await login();
    const before = await prisma.integrationConnection.findFirstOrThrow({ where: { storeId } });
    const rotationKey = `rotate-${randomUUID()}`;
    const rotations = await Promise.all([
      request(baseUrl)
        .patch(
          `/integrations/organizations/${organizationId}/shopify/stores/${storeId}/credentials`,
        )
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', rotationKey)
        .send({ accessToken: rotatedToken }),
      request(baseUrl)
        .patch(
          `/integrations/organizations/${organizationId}/shopify/stores/${storeId}/credentials`,
        )
        .set('authorization', `Bearer ${owner.accessToken}`)
        .set('idempotency-key', rotationKey)
        .send({ accessToken: rotatedToken }),
    ]);
    expect(rotations.map(({ status }) => status)).toEqual([200, 200]);
    expect(rotations[0]?.body).toEqual(rotations[1]?.body);
    const after = await prisma.integrationConnection.findFirstOrThrow({ where: { storeId } });
    expect(after.encryptedCredentialsJson).not.toEqual(before.encryptedCredentialsJson);
    expect(after).toMatchObject({
      lastHealthCheckAt: null,
      lastHealthStatus: 'UNKNOWN',
      status: 'PENDING',
    });
    expect(JSON.stringify(after)).not.toContain(rotatedToken);

    await request(baseUrl)
      .patch(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/credentials`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-rotate-${randomUUID()}`)
      .send({ accessToken: 'mock-invalid-token' })
      .expect(200);
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/test`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-test-${randomUUID()}`)
      .expect(200)
      .expect(({ body }: { body: StoreResponse }) => {
        expect(body).toMatchObject({ health: 'unhealthy', status: 'error' });
      });
    await request(baseUrl)
      .post(`/integrations/organizations/${organizationId}/shopify/stores/${storeId}/activate`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `bad-activate-${randomUUID()}`)
      .expect(409);

    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_shopify_operations_total');
    const audit = JSON.stringify(
      await prisma.auditLog.findMany({ where: { action: { startsWith: 'shopify.' } } }),
    );
    expect(audit).not.toContain(initialToken);
    expect(audit).not.toContain(rotatedToken);
    expect(audit).not.toContain('safe-store.myshopify.com');
    expect(audit).not.toContain(rotationKey);
  });
});
