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
import type { FinanceOverviewResult } from '../src/finance/finance-overview.service';

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
const databaseName = `ecommerce_finance_overview_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const environmentNames = ['FINANCE_OVERVIEW_ENABLED', 'FINANCE_OVERVIEW_KILL_SWITCH'] as const;
const previousEnvironment = new Map(
  environmentNames.map((name) => [name, process.env[name]] as const),
);
const password = 'Correct-password-123';

interface Tokens {
  readonly accessToken: string;
}

describe('finance overview API', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let financeToken: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let prisma: PrismaClient;
  let readOnlyToken: string;
  let orderId: string;

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
      FINANCE_OVERVIEW_ENABLED: 'true',
      FINANCE_OVERVIEW_KILL_SWITCH: 'false',
      POSTGRES_DB: databaseName,
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    organizationId = (await prisma.organization.create({ data: { name: 'Finance tenant' } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: 'Other tenant' } })).id;
    const passwordHash = await new PasswordService().hash(password);
    for (const [email, role] of [
      ['finance@example.test', 'FINANCE'],
      ['finance-reader@example.test', 'READ_ONLY'],
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
    orderId = await seedPortfolioOrder();
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    financeToken = await login('finance@example.test');
    readOnlyToken = await login('finance-reader@example.test');
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
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

  const seedPortfolioOrder = async (): Promise<string> => {
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Finance store',
        organizationId,
        shopifyShopDomain: 'finance-store.myshopify.com',
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
        shopifyOrderName: '#FINANCE-1',
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
    const createdAt = new Date(Date.now() - 30 * 60 * 1_000);
    await Promise.all(
      [
        {
          amount: 1_200_000n,
          attemptNumber: 1,
          externalReference: 'finance-pending',
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
          idempotencyKey: `finance-pending-${randomUUID()}`,
          providerCheckoutId: randomUUID(),
          status: 'PENDING',
          createdAt,
        },
        {
          amount: 9_007_199_254_740_993n,
          attemptNumber: 1,
          externalReference: 'finance-approved',
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
          idempotencyKey: `finance-approved-${randomUUID()}`,
          providerCheckoutId: randomUUID(),
          status: 'APPROVED',
          createdAt,
        },
        {
          amount: 500_000n,
          attemptNumber: 1,
          externalReference: 'finance-declined',
          expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
          idempotencyKey: `finance-declined-${randomUUID()}`,
          providerCheckoutId: randomUUID(),
          status: 'DECLINED',
          createdAt,
        },
        {
          amount: 300_000n,
          attemptNumber: 1,
          externalReference: 'finance-expired',
          expiresAt: new Date(createdAt.getTime() + 10 * 60 * 1_000),
          expiredAt: new Date(createdAt.getTime() + 10 * 60 * 1_000),
          idempotencyKey: `finance-expired-${randomUUID()}`,
          providerCheckoutId: randomUUID(),
          status: 'EXPIRED',
          createdAt,
        },
      ].map((paymentIntent) =>
        prisma.paymentIntent.create({
          data: {
            abandonmentAction: 'MARK',
            amount: paymentIntent.amount,
            attemptNumber: paymentIntent.attemptNumber,
            checkoutUrl: `https://checkout.wompi.simulated.invalid/p/${paymentIntent.externalReference}`,
            currency: 'COP',
            createdAt: paymentIntent.createdAt,
            expiredAt: paymentIntent.expiredAt ?? null,
            expiresAt: paymentIntent.expiresAt,
            externalReference: paymentIntent.externalReference,
            idempotencyKey: paymentIntent.idempotencyKey,
            orderId: order.id,
            organizationId,
            provider: 'WOMPI',
            providerCheckoutId: paymentIntent.providerCheckoutId,
            status: paymentIntent.status as 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'PENDING',
            storeId: store.id,
          },
        }),
      ),
    );
    return order.id;
  };

  const overview = (
    token: string,
    tenant = organizationId,
    from = new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
    to = new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  ) =>
    request(baseUrl)
      .get(`/finance/organizations/${tenant}/overview`)
      .set('authorization', `Bearer ${token}`)
      .query({ from, to });

  it('enforces RBAC and tenant isolation before exposing the overview', async () => {
    await overview(readOnlyToken).expect(403);
    await overview(financeToken, otherOrganizationId).expect(403);
  });

  it('returns a tenant-scoped Wompi payment portfolio summary', async () => {
    const response = await overview(financeToken).expect(200);
    const body = response.body as unknown as FinanceOverviewResult;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      contractVersion: 'v1',
      currency: 'COP',
      mode: 'simulation',
      provider: 'wompi',
      totals: {
        amountMinor: '9007199256740993',
        count: 4,
      },
    });
    expect(
      [...body.byStatus].sort((left, right) => left.status.localeCompare(right.status)),
    ).toEqual([
      { amountMinor: '9007199254740993', count: 1, status: 'approved' },
      { amountMinor: '500000', count: 1, status: 'declined' },
      { amountMinor: '300000', count: 1, status: 'expired' },
      { amountMinor: '1200000', count: 1, status: 'pending' },
    ]);
    expect(orderId).toMatch(/^[0-9a-f-]{36}$/u);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'finance.overview.viewed', organizationId },
    });
    expect(audit.metadataJson).toEqual({ count: 4, windowMinutes: 120 });
    expect(JSON.stringify(audit.metadataJson)).not.toContain('amount');
  });

  it('returns an exact empty portfolio and rejects invalid or excessive windows', async () => {
    const futureFrom = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    const futureTo = new Date(futureFrom.getTime() + 60 * 60 * 1_000);
    const empty = await overview(
      financeToken,
      organizationId,
      futureFrom.toISOString(),
      futureTo.toISOString(),
    ).expect(200);
    expect(empty.body).toMatchObject({ byStatus: [], totals: { amountMinor: '0', count: 0 } });

    await overview(
      financeToken,
      organizationId,
      futureFrom.toISOString(),
      futureFrom.toISOString(),
    ).expect(400);
    await overview(
      financeToken,
      organizationId,
      new Date(futureFrom.getTime() - 32 * 24 * 60 * 60 * 1_000).toISOString(),
      futureFrom.toISOString(),
    ).expect(400);
  });

  it('fails closed when the finance kill switch is active', async () => {
    process.env.FINANCE_OVERVIEW_KILL_SWITCH = 'true';
    const disabledApp = await createApplication();
    try {
      await disabledApp.listen(0, '127.0.0.1');
      const disabledUrl = await disabledApp.getUrl();
      await request(disabledUrl)
        .get(`/finance/organizations/${organizationId}/overview`)
        .set('authorization', `Bearer ${financeToken}`)
        .query({
          from: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
          to: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        })
        .expect(503);
    } finally {
      await disabledApp.close();
      process.env.FINANCE_OVERVIEW_KILL_SWITCH = 'false';
    }
  });
});
