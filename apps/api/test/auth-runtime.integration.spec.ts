import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

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
const databaseName = `ecommerce_auth_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const tokenSchema = z.object({
  accessExpiresAt: z.string().datetime(),
  accessToken: z.string(),
  refreshExpiresAt: z.string().datetime(),
  refreshToken: z.string(),
});
type Tokens = z.infer<typeof tokenSchema>;

const parseJson = (text: string): unknown => JSON.parse(text) as unknown;
const sessionIdFrom = (token: string): string => {
  const sessionId = token.split('.')[0];
  if (sessionId === undefined) throw new Error('Token is missing session id');
  return sessionId;
};

describe('identity, sessions and RBAC runtime', () => {
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
    process.env.AUTH_LOGIN_MAX_ATTEMPTS = '3';
    process.env.AUTH_RATE_WINDOW_MS = '60000';
    process.env.AUTH_BLOCK_DURATION_MS = '10000';
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const [organization, otherOrganization] = await Promise.all([
      prisma.organization.create({ data: { name: 'Auth tenant' } }),
      prisma.organization.create({ data: { name: 'Other tenant' } }),
    ]);
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    const passwordService = new PasswordService();
    const passwordHash = await passwordService.hash('Correct-password-123');
    await Promise.all([
      prisma.user.create({
        data: {
          email: 'owner@example.test',
          memberships: { create: { organizationId, role: 'OWNER' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
      prisma.user.create({
        data: {
          email: 'reader@example.test',
          memberships: { create: { organizationId, role: 'READ_ONLY' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
      prisma.user.create({
        data: {
          email: 'locked@example.test',
          memberships: { create: { organizationId, role: 'OPERATIONS' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
    ]);
    const application = await createApplication();
    app = application;
    await application.listen(0, '127.0.0.1');
    baseUrl = await application.getUrl();
  });

  afterAll(async () => {
    await app?.close();
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

  const login = async (email = 'owner@example.test'): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password: 'Correct-password-123' })
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return tokenSchema.parse(parseJson(response.text));
  };

  it('creates a hashed, revocable session and authenticates the owner', async () => {
    const tokens = await login();
    const sessionId = sessionIdFrom(tokens.accessToken);
    const session = await prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.accessTokenHash).not.toContain(tokens.accessToken);
    expect(session.refreshTokenHash).not.toContain(tokens.refreshToken);

    const me = await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(parseJson(me.text)).toMatchObject({ organizationId, role: 'OWNER' });
    await request(baseUrl)
      .get(`/auth/organizations/${organizationId}/admin-check`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200, { authorized: true, organizationId });
  });

  it('applies default-deny RBAC and tenant isolation in the backend', async () => {
    const tokens = await login('reader@example.test');
    await request(baseUrl)
      .get(`/auth/organizations/${organizationId}/admin-check`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
    await request(baseUrl)
      .get(`/auth/organizations/${otherOrganizationId}/admin-check`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
    expect(
      await prisma.auditLog.count({ where: { action: 'authorization.denied', outcome: 'DENIED' } }),
    ).toBe(2);
  });

  it('rotates refresh credentials and revokes the session on token replay', async () => {
    const original = await login();
    const refreshResponse = await request(baseUrl)
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(200);
    const rotated = tokenSchema.parse(parseJson(refreshResponse.text));
    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${original.accessToken}`)
      .expect(401);
    await request(baseUrl)
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(401);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${rotated.accessToken}`)
      .expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_reuse' } })).toBe(1);
  });

  it('enforces expiration and immediate logout revocation', async () => {
    const expired = await login();
    const expiredSessionId = sessionIdFrom(expired.accessToken);
    await prisma.authSession.update({
      data: { accessExpiresAt: new Date(0) },
      where: { id: expiredSessionId },
    });
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${expired.accessToken}`)
      .expect(401);

    const active = await login();
    await request(baseUrl)
      .post('/auth/logout')
      .set('authorization', `Bearer ${active.accessToken}`)
      .expect(204);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${active.accessToken}`)
      .expect(401);
  });

  it('returns uniform credential failures and blocks repeated login attempts', async () => {
    const unknown = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: 'missing@example.test',
        organizationId,
        password: 'Incorrect-password-123',
      })
      .expect(401);
    const known = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: 'locked@example.test',
        organizationId,
        password: 'Incorrect-password-123',
      })
      .expect(401);
    expect(parseJson(unknown.text)).toMatchObject({ message: 'Invalid credentials' });
    expect(parseJson(known.text)).toMatchObject({ message: 'Invalid credentials' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(baseUrl)
        .post('/auth/login')
        .send({
          email: 'locked@example.test',
          organizationId,
          password: 'Incorrect-password-123',
        })
        .expect(attempt < 2 ? 401 : 429);
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'locked@example.test' } });
    expect(user.lockedUntil).not.toBeNull();
  });

  it('does not persist credentials or tokens in audit metadata', async () => {
    const audits = await prisma.auditLog.findMany();
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain('Correct-password-123');
    expect(serialized).not.toContain('Incorrect-password-123');
    expect(serialized).not.toContain('Bearer ');
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_auth_events_total');
  });
});
