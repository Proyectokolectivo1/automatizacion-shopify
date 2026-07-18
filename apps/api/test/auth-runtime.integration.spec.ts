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
import { EmailDeliveryService } from '../src/email/email-delivery.service';
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
  let emailDelivery: EmailDeliveryService;

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
    process.env.AUTH_ACCOUNT_ACTIONS_ENABLED = 'true';
    process.env.AUTH_ACCOUNT_ACTIONS_KILL_SWITCH = 'false';
    process.env.EMAIL_DELIVERY_ENABLED = 'true';
    process.env.EMAIL_KILL_SWITCH = 'false';
    process.env.EMAIL_SIMULATION_MODE = 'true';
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
          email: 'admin@example.test',
          memberships: { create: { organizationId, role: 'ADMIN' } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
      }),
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
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@example.test' } });
    await prisma.organizationMembership.create({
      data: { organizationId: otherOrganizationId, role: 'OWNER', userId: owner.id },
    });
    const application = await createApplication();
    app = application;
    emailDelivery = application.get(EmailDeliveryService);
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

  const login = async (
    email = 'owner@example.test',
    password = 'Correct-password-123',
  ): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password })
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return tokenSchema.parse(parseJson(response.text));
  };

  const invite = async (email: string, role = 'SUPPORT', actor = 'owner@example.test') => {
    const tokens = await login(actor);
    await request(baseUrl)
      .post(`/auth/organizations/${organizationId}/invitations`)
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .send({ email, role })
      .expect(202, { status: 'accepted' });
    const fixture = emailDelivery.takeSimulationFixture('invitation', email);
    expect(fixture).toBeDefined();
    if (fixture === undefined) throw new Error('Missing invitation fixture');
    return fixture.token;
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

  it('discovers only active organizations after credential verification without issuing tokens', async () => {
    const response = await request(baseUrl)
      .post('/auth/login-options')
      .send({ email: 'owner@example.test', password: 'Correct-password-123' })
      .expect(200)
      .expect('cache-control', 'no-store');
    expect(parseJson(response.text)).toEqual([
      {
        dashboardAllowed: true,
        name: 'Auth tenant',
        organizationId,
        role: 'OWNER',
      },
      {
        dashboardAllowed: true,
        name: 'Other tenant',
        organizationId: otherOrganizationId,
        role: 'OWNER',
      },
    ]);
    expect(response.text).not.toMatch(/accessToken|refreshToken|Correct-password/u);
    const invalid = await request(baseUrl)
      .post('/auth/login-options')
      .send({ email: 'missing@example.test', password: 'Incorrect-password-123' })
      .expect(401);
    expect(parseJson(invalid.text)).toMatchObject({ message: 'Invalid credentials' });
    await request(baseUrl)
      .post('/auth/login-options')
      .send({ email: 'owner@example.test', password: 'Correct-password-123', unknown: true })
      .expect(400);
  });

  it('lists current memberships and atomically rotates the session when switching tenant', async () => {
    const original = await login();
    const options = await request(baseUrl)
      .get('/auth/organizations')
      .set('authorization', `Bearer ${original.accessToken}`)
      .expect(200)
      .expect('cache-control', 'no-store');
    expect((parseJson(options.text) as readonly unknown[]).length).toBe(2);
    const switchedResponse = await request(baseUrl)
      .post('/auth/switch-organization')
      .set('authorization', `Bearer ${original.accessToken}`)
      .send({ organizationId: otherOrganizationId })
      .expect(200)
      .expect('cache-control', 'no-store');
    const switched = tokenSchema.parse(parseJson(switchedResponse.text));
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${original.accessToken}`)
      .expect(401);
    const me = await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${switched.accessToken}`)
      .expect(200);
    expect(parseJson(me.text)).toMatchObject({
      organizationId: otherOrganizationId,
      role: 'OWNER',
    });
    const rejected = await login();
    await request(baseUrl)
      .post('/auth/switch-organization')
      .set('authorization', `Bearer ${rejected.accessToken}`)
      .send({ organizationId: randomUUID() })
      .expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'auth.organization_switched' } })).toBe(
      1,
    );
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

  it('invites a user with a lower role, stores only the token hash and consumes it once', async () => {
    const email = 'invited@example.test';
    const token = await invite(email, 'SUPPORT');
    const action = await prisma.accountActionToken.findFirstOrThrow({
      where: { invitedEmail: email, purpose: 'INVITATION' },
    });
    expect(action.tokenHash).not.toContain(token);

    await request(baseUrl)
      .post('/auth/invitations/accept')
      .send({ password: 'Invited-password-123', token })
      .expect(200, { status: 'accepted' });
    await request(baseUrl)
      .post('/auth/invitations/accept')
      .send({ password: 'Invited-password-123', token })
      .expect(400);

    const tokens = await login(email, 'Invited-password-123');
    const me = await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(parseJson(me.text)).toMatchObject({ organizationId, role: 'SUPPORT' });
    expect(
      await prisma.accountActionToken.findUniqueOrThrow({ where: { id: action.id } }),
    ).toMatchObject({ revokedAt: null });
  });

  it('prevents role escalation and cross-tenant invitation issuance', async () => {
    const admin = await login('admin@example.test');
    await request(baseUrl)
      .post(`/auth/organizations/${organizationId}/invitations`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .send({ email: 'admin-target@example.test', role: 'ADMIN' })
      .expect(403);

    const owner = await login();
    await request(baseUrl)
      .post(`/auth/organizations/${organizationId}/invitations`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'owner-target@example.test', role: 'OWNER' })
      .expect(403);
    await request(baseUrl)
      .post(`/auth/organizations/${otherOrganizationId}/invitations`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send({ email: 'cross-tenant@example.test', role: 'SUPPORT' })
      .expect(403);

    const reader = await login('reader@example.test');
    await request(baseUrl)
      .post(`/auth/organizations/${organizationId}/invitations`)
      .set('authorization', `Bearer ${reader.accessToken}`)
      .send({ email: 'reader-target@example.test', role: 'SUPPORT' })
      .expect(403);
  });

  it('links an existing account without replacing its password', async () => {
    const email = 'existing-account@example.test';
    const passwordService = new PasswordService();
    await prisma.user.create({
      data: {
        email,
        passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
        passwordHash: await passwordService.hash('Existing-password-123'),
        passwordParametersJson: PASSWORD_PARAMETERS,
      },
    });
    const token = await invite(email, 'FINANCE');
    await request(baseUrl)
      .post('/auth/invitations/accept')
      .send({ password: 'Must-not-replace-123', token })
      .expect(200, { status: 'accepted' });
    await login(email, 'Existing-password-123');
    await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password: 'Must-not-replace-123' })
      .expect(401);
  });

  it('rejects expired invitations and serializes concurrent consumption', async () => {
    const expiredEmail = 'expired-invite@example.test';
    const expiredToken = await invite(expiredEmail);
    const expiredAction = await prisma.accountActionToken.findFirstOrThrow({
      where: { invitedEmail: expiredEmail, purpose: 'INVITATION' },
    });
    await prisma.$executeRaw`
      UPDATE account_action_tokens
      SET created_at = NOW() - INTERVAL '2 days',
          expires_at = NOW() - INTERVAL '1 day'
      WHERE id = ${expiredAction.id}::uuid
    `;
    await request(baseUrl)
      .post('/auth/invitations/accept')
      .send({ password: 'Expired-password-123', token: expiredToken })
      .expect(400);

    const concurrentEmail = 'concurrent-invite@example.test';
    const concurrentToken = await invite(concurrentEmail);
    const attempts = await Promise.all([
      request(baseUrl)
        .post('/auth/invitations/accept')
        .send({ password: 'Concurrent-password-123', token: concurrentToken }),
      request(baseUrl)
        .post('/auth/invitations/accept')
        .send({ password: 'Concurrent-password-123', token: concurrentToken }),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(await prisma.user.count({ where: { email: concurrentEmail } })).toBe(1);
  });

  it('fails closed when account actions are disabled while recovery stays non-enumerating', async () => {
    process.env.AUTH_ACCOUNT_ACTIONS_ENABLED = 'false';
    process.env.AUTH_ACCOUNT_ACTIONS_KILL_SWITCH = 'true';
    const disabledApp = await createApplication();
    try {
      await disabledApp.listen(0, '127.0.0.1');
      const disabledUrl = await disabledApp.getUrl();
      const before = await prisma.accountActionToken.count();
      const ownerTokens = await request(disabledUrl)
        .post('/auth/login')
        .send({
          email: 'owner@example.test',
          organizationId,
          password: 'Correct-password-123',
        })
        .expect(200);
      const parsedTokens = tokenSchema.parse(parseJson(ownerTokens.text));
      await request(disabledUrl)
        .post(`/auth/organizations/${organizationId}/invitations`)
        .set('authorization', `Bearer ${parsedTokens.accessToken}`)
        .send({ email: 'blocked-invite@example.test', role: 'SUPPORT' })
        .expect(503);
      await request(disabledUrl)
        .post('/auth/password-recovery/request')
        .send({ email: 'owner@example.test' })
        .expect(202, { status: 'accepted' });
      expect(await prisma.accountActionToken.count()).toBe(before);
    } finally {
      await disabledApp.close();
      process.env.AUTH_ACCOUNT_ACTIONS_ENABLED = 'true';
      process.env.AUTH_ACCOUNT_ACTIONS_KILL_SWITCH = 'false';
    }
  });

  it('returns uniform recovery responses, resets once and revokes existing sessions', async () => {
    const oldSession = await login();
    const known = await request(baseUrl)
      .post('/auth/password-recovery/request')
      .send({ email: 'owner@example.test' })
      .expect(202);
    const unknown = await request(baseUrl)
      .post('/auth/password-recovery/request')
      .send({ email: 'unknown-recovery@example.test' })
      .expect(202);
    expect(parseJson(known.text)).toEqual(parseJson(unknown.text));

    const fixture = emailDelivery.takeSimulationFixture('password_reset', 'owner@example.test');
    expect(fixture).toBeDefined();
    if (fixture === undefined) throw new Error('Missing password reset fixture');
    expect(
      emailDelivery.takeSimulationFixture('password_reset', 'unknown-recovery@example.test'),
    ).toBeUndefined();
    const action = await prisma.accountActionToken.findFirstOrThrow({
      where: { purpose: 'PASSWORD_RESET', user: { email: 'owner@example.test' } },
    });
    expect(action.tokenHash).not.toContain(fixture.token);

    const completions = await Promise.all([
      request(baseUrl)
        .post('/auth/password-recovery/complete')
        .send({ newPassword: 'Recovered-password-123', token: fixture.token }),
      request(baseUrl)
        .post('/auth/password-recovery/complete')
        .send({ newPassword: 'Recovered-password-123', token: fixture.token }),
    ]);
    expect(completions.map(({ status }) => status).sort()).toEqual([200, 400]);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${oldSession.accessToken}`)
      .expect(401);
    await request(baseUrl)
      .post('/auth/password-recovery/complete')
      .send({ newPassword: 'Another-password-123', token: fixture.token })
      .expect(400);
    await request(baseUrl)
      .post('/auth/login')
      .send({
        email: 'owner@example.test',
        organizationId,
        password: 'Correct-password-123',
      })
      .expect(401);
    await login('owner@example.test', 'Recovered-password-123');
  });

  it('rejects an expired password recovery token without changing credentials', async () => {
    await request(baseUrl)
      .post('/auth/password-recovery/request')
      .send({ email: 'admin@example.test' })
      .expect(202, { status: 'accepted' });
    const fixture = emailDelivery.takeSimulationFixture('password_reset', 'admin@example.test');
    expect(fixture).toBeDefined();
    if (fixture === undefined) throw new Error('Missing expired reset fixture');
    const action = await prisma.accountActionToken.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { purpose: 'PASSWORD_RESET', user: { email: 'admin@example.test' } },
    });
    await prisma.$executeRaw`
      UPDATE account_action_tokens
      SET created_at = NOW() - INTERVAL '2 hours',
          expires_at = NOW() - INTERVAL '1 hour'
      WHERE id = ${action.id}::uuid
    `;
    await request(baseUrl)
      .post('/auth/password-recovery/complete')
      .send({ newPassword: 'Should-not-apply-123', token: fixture.token })
      .expect(400);
    await login('admin@example.test', 'Correct-password-123');
  });

  it('keeps invitation and recovery secrets and personal data out of audit metadata', async () => {
    const audits = await prisma.auditLog.findMany({
      where: { action: { startsWith: 'auth.' } },
    });
    const metadata = JSON.stringify(audits.map(({ metadataJson }) => metadataJson));
    expect(metadata).not.toContain('@example.test');
    expect(metadata).not.toContain('password');
    expect(metadata).not.toContain('token');
    expect(await prisma.auditLog.count({ where: { action: 'auth.invitation.accepted' } })).toBe(3);
    expect(
      await prisma.auditLog.count({ where: { action: 'auth.password_recovery.completed' } }),
    ).toBe(1);
  });
});
