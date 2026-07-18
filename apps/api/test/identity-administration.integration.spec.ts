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
import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { IdentityAdministrationService } from '../src/identity/identity-administration.service';
import { OwnerBootstrapService } from '../src/identity/owner-bootstrap.service';
import { WhatsAppAssignmentService } from '../src/whatsapp/whatsapp-assignment.service';

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
const databaseName = `ecommerce_identity_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(adminConfig.password)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const prismaCli = createRequire(resolve(process.cwd(), 'package.json')).resolve(
  'prisma/build/index.js',
);
const password = 'Correct-password-123';
const bootstrapSecret = `bootstrap-${randomUUID()}-${randomUUID()}`;

interface Tokens {
  readonly accessToken: string;
}

interface MembershipListResponse {
  readonly items: readonly Record<string, unknown>[];
  readonly nextCursor: string | null;
}

describe('owner bootstrap and tenant-safe identity administration', () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let ownerUserId: string;
  let adminMembershipId: string;
  let readerMembershipId: string;
  let supportMembershipId: string;
  let foreignMembershipId: string;
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
    process.env.IDENTITY_BOOTSTRAP_ENABLED = 'true';
    process.env.IDENTITY_BOOTSTRAP_KILL_SWITCH = 'false';
    process.env.IDENTITY_BOOTSTRAP_SECRET = bootstrapSecret;
    process.env.IDENTITY_BOOTSTRAP_EMAIL = 'bootstrap-owner@example.test';
    process.env.IDENTITY_BOOTSTRAP_PASSWORD = password;
    process.env.IDENTITY_BOOTSTRAP_ORGANIZATION_NAME = 'Bootstrap tenant';
    const bootstrapEnvironment = new EnvironmentService();
    const bootstrapPrisma = new PrismaService(bootstrapEnvironment);
    await bootstrapPrisma.$connect();
    const bootstrap = new OwnerBootstrapService(
      bootstrapEnvironment,
      new PasswordService(),
      bootstrapPrisma,
    );
    const results = await Promise.all([bootstrap.execute(), bootstrap.execute()]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      'already_initialized',
      'initialized',
    ]);
    expect(await bootstrap.execute()).toEqual({ status: 'already_initialized' });
    await bootstrapPrisma.$disconnect();

    process.env.IDENTITY_BOOTSTRAP_ENABLED = 'false';
    process.env.IDENTITY_BOOTSTRAP_KILL_SWITCH = 'true';
    delete process.env.IDENTITY_BOOTSTRAP_SECRET;
    delete process.env.IDENTITY_BOOTSTRAP_EMAIL;
    delete process.env.IDENTITY_BOOTSTRAP_PASSWORD;
    delete process.env.IDENTITY_BOOTSTRAP_ORGANIZATION_NAME;
    process.env.IDENTITY_ADMIN_ENABLED = 'true';
    process.env.IDENTITY_ADMIN_KILL_SWITCH = 'false';
    process.env.WHATSAPP_INTEGRATIONS_ENABLED = 'true';
    process.env.WHATSAPP_INTEGRATIONS_KILL_SWITCH = 'false';
    process.env.WHATSAPP_SIMULATION_MODE = 'true';
    process.env.WHATSAPP_INBOX_ENABLED = 'true';
    process.env.WHATSAPP_INBOX_KILL_SWITCH = 'false';
    process.env.WHATSAPP_INBOX_SIMULATION_MODE = 'true';
    process.env.WHATSAPP_ASSIGNMENTS_ENABLED = 'true';
    process.env.WHATSAPP_ASSIGNMENTS_KILL_SWITCH = 'false';
    process.env.WHATSAPP_ASSIGNMENTS_SIMULATION_MODE = 'true';
    process.env.WHATSAPP_CREDENTIAL_KEY_VERSION = 'v1';
    process.env.WHATSAPP_CREDENTIAL_KEYS_JSON = JSON.stringify({
      v1: randomBytes(32).toString('base64url'),
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
    const owner = await prisma.user.findUniqueOrThrow({
      include: { memberships: true },
      where: { email: 'bootstrap-owner@example.test' },
    });
    ownerUserId = owner.id;
    organizationId = owner.memberships[0]?.organizationId ?? '';
    const passwordHash = await new PasswordService().hash(password);
    const createMember = (email: string, role: 'ADMIN' | 'READ_ONLY' | 'SUPPORT') =>
      prisma.user.create({
        data: {
          email,
          memberships: { create: { organizationId, role } },
          passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
          passwordHash,
          passwordParametersJson: PASSWORD_PARAMETERS,
        },
        include: { memberships: true },
      });
    const [adminUser, readerUser, supportUser, otherOrganization] = await Promise.all([
      createMember('identity-admin@example.test', 'ADMIN'),
      createMember('identity-reader@example.test', 'READ_ONLY'),
      createMember('identity-support@example.test', 'SUPPORT'),
      prisma.organization.create({ data: { name: 'Foreign identity tenant' } }),
    ]);
    adminMembershipId = adminUser.memberships[0]?.id ?? '';
    readerMembershipId = readerUser.memberships[0]?.id ?? '';
    supportMembershipId = supportUser.memberships[0]?.id ?? '';
    otherOrganizationId = otherOrganization.id;
    const foreign = await prisma.user.create({
      data: {
        email: 'foreign-owner@example.test',
        memberships: { create: { organizationId: otherOrganizationId, role: 'OWNER' } },
        passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
        passwordHash,
        passwordParametersJson: PASSWORD_PARAMETERS,
      },
      include: { memberships: true },
    });
    foreignMembershipId = foreign.memberships[0]?.id ?? '';

    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
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

  const login = async (email = 'bootstrap-owner@example.test'): Promise<Tokens> => {
    const response = await request(baseUrl)
      .post('/auth/login')
      .send({ email, organizationId, password })
      .expect(200);
    return response.body as Tokens;
  };

  it('bootstraps exactly one owner without persisting credentials or secrets', async () => {
    expect(await prisma.user.count()).toBe(5);
    expect(
      await prisma.organizationMembership.count({
        where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
      }),
    ).toBe(1);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'bootstrap-owner@example.test' },
    });
    expect(owner.passwordHash).not.toContain(password);
    const audit = JSON.stringify(
      await prisma.auditLog.findMany({ where: { action: { startsWith: 'identity.bootstrap.' } } }),
    );
    expect(audit).not.toContain(bootstrapSecret);
    expect(audit).not.toContain('bootstrap-owner@example.test');
  });

  it('paginates the minimal tenant list and denies low-role and cross-tenant access', async () => {
    const [owner, reader] = await Promise.all([login(), login('identity-reader@example.test')]);
    const first = await request(baseUrl)
      .get(`/identity/organizations/${organizationId}/memberships?limit=2`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const firstBody = first.body as MembershipListResponse;
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(Object.keys(firstBody.items[0] ?? {}).sort()).toEqual([
      'createdAt',
      'email',
      'membershipId',
      'role',
      'status',
      'updatedAt',
      'userId',
      'userStatus',
    ]);
    await request(baseUrl)
      .get(
        `/identity/organizations/${organizationId}/memberships?limit=10&cursor=${encodeURIComponent(String(firstBody.nextCursor))}`,
      )
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    await request(baseUrl)
      .get(`/identity/organizations/${organizationId}/memberships`)
      .set('authorization', `Bearer ${reader.accessToken}`)
      .expect(403);
    await request(baseUrl)
      .get(`/identity/organizations/${otherOrganizationId}/memberships`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .expect(403);
  });

  it('changes a role once, rejects key reuse and invalidates all target sessions', async () => {
    const [admin, reader] = await Promise.all([
      login('identity-admin@example.test'),
      login('identity-reader@example.test'),
    ]);
    const key = `role-${randomUUID()}`;
    const responses = await Promise.all([
      request(baseUrl)
        .patch(`/identity/organizations/${organizationId}/memberships/${readerMembershipId}/role`)
        .set('authorization', `Bearer ${admin.accessToken}`)
        .set('idempotency-key', key)
        .send({ role: 'OPERATIONS' }),
      request(baseUrl)
        .patch(`/identity/organizations/${organizationId}/memberships/${readerMembershipId}/role`)
        .set('authorization', `Bearer ${admin.accessToken}`)
        .set('idempotency-key', key)
        .send({ role: 'OPERATIONS' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${reader.accessToken}`)
      .expect(401);
    await request(baseUrl)
      .patch(`/identity/organizations/${organizationId}/memberships/${readerMembershipId}/role`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', key)
      .send({ role: 'FINANCE' })
      .expect(409);
    await request(baseUrl)
      .patch(`/identity/organizations/${organizationId}/memberships/${readerMembershipId}/role`)
      .set('authorization', `Bearer ${admin.accessToken}`)
      .set('idempotency-key', `escalate-${randomUUID()}`)
      .send({ role: 'OWNER' })
      .expect(403);
    expect(await prisma.idempotencyKey.count({ where: { key: { contains: key } } })).toBe(0);
  });

  it('allows owner escalation but blocks self changes, foreign memberships and the last owner', async () => {
    const [owner, admin] = await Promise.all([login(), login('identity-admin@example.test')]);
    await request(baseUrl)
      .patch(`/identity/organizations/${organizationId}/memberships/${adminMembershipId}/role`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `owner-promote-${randomUUID()}`)
      .send({ role: 'OWNER' })
      .expect(200);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${admin.accessToken}`)
      .expect(401);
    const ownerMembership = await prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId, userId: ownerUserId },
    });
    await request(baseUrl)
      .post(`/identity/organizations/${organizationId}/memberships/${ownerMembership.id}/revoke`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `self-${randomUUID()}`)
      .expect(403);
    await request(baseUrl)
      .post(`/identity/organizations/${organizationId}/memberships/${foreignMembershipId}/revoke`)
      .set('authorization', `Bearer ${owner.accessToken}`)
      .set('idempotency-key', `foreign-${randomUUID()}`)
      .expect(404);

    const identities = app?.get(IdentityAdministrationService);
    if (identities === undefined) throw new Error('Identity service missing');
    await expect(
      identities.revoke({
        idempotencyKey: `last-owner-${randomUUID()}`,
        membershipId: foreignMembershipId,
        organizationId: otherOrganizationId,
        principal: {
          email: 'bootstrap-owner@example.test',
          organizationId: otherOrganizationId,
          role: 'OWNER',
          sessionId: randomUUID(),
          userId: ownerUserId,
        },
      }),
    ).rejects.toThrow(/last owner/u);
  });

  it('atomically revokes, releases assignments, survives a claim race and exports bounded evidence', async () => {
    const [owner, support] = await Promise.all([login(), login('identity-support@example.test')]);
    const [ownerMembership, supportMembership] = await Promise.all([
      prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId, user: { email: 'bootstrap-owner@example.test' } },
      }),
      prisma.organizationMembership.findUniqueOrThrow({ where: { id: supportMembershipId } }),
    ]);
    const store = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Identity assignment store',
        organizationId,
        shopifyShopDomain: `identity-${randomUUID().slice(0, 8)}.myshopify.com`,
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    const assignedAt = new Date();
    const assignedConversations = await Promise.all(
      [0, 1].map((index) =>
        prisma.whatsAppConversation.create({
          data: {
            assignedAt,
            assignedMembershipId: supportMembershipId,
            assignmentVersion: 1,
            contactHash: randomBytes(32).toString('hex'),
            lastMessageAt: new Date(assignedAt.getTime() + index),
            organizationId,
            storeId: store.id,
          },
        }),
      ),
    );
    await prisma.whatsAppConversationAssignmentHistory.createMany({
      data: assignedConversations.map((conversation) => ({
        action: 'CLAIM',
        actorMembershipId: supportMembershipId,
        conversationId: conversation.id,
        newAssigneeMembershipId: supportMembershipId,
        organizationId,
        storeId: store.id,
        version: 1,
      })),
    });
    const raceConversation = await prisma.whatsAppConversation.create({
      data: {
        contactHash: randomBytes(32).toString('hex'),
        lastMessageAt: new Date(assignedAt.getTime() + 3),
        organizationId,
        storeId: store.id,
      },
    });
    const foreignStore = await prisma.store.create({
      data: {
        currency: 'COP',
        name: 'Foreign identity assignment store',
        organizationId: otherOrganizationId,
        shopifyShopDomain: `foreign-identity-${randomUUID().slice(0, 8)}.myshopify.com`,
        status: 'ACTIVE',
        timezone: 'America/Bogota',
      },
    });
    const foreignConversation = await prisma.whatsAppConversation.create({
      data: {
        assignedAt,
        assignedMembershipId: foreignMembershipId,
        assignmentVersion: 1,
        contactHash: randomBytes(32).toString('hex'),
        lastMessageAt: assignedAt,
        organizationId: otherOrganizationId,
        storeId: foreignStore.id,
      },
    });

    const key = `revoke-${randomUUID()}`;
    const assignments = app?.get(WhatsAppAssignmentService);
    if (assignments === undefined) throw new Error('WhatsApp assignment service missing');
    const [responses, claim] = await Promise.all([
      Promise.all([
        request(baseUrl)
          .post(
            `/identity/organizations/${organizationId}/memberships/${supportMembershipId}/revoke`,
          )
          .set('authorization', `Bearer ${owner.accessToken}`)
          .set('idempotency-key', key),
        request(baseUrl)
          .post(
            `/identity/organizations/${organizationId}/memberships/${supportMembershipId}/revoke`,
          )
          .set('authorization', `Bearer ${owner.accessToken}`)
          .set('idempotency-key', key),
      ]),
      Promise.allSettled([
        assignments.claim({
          conversationId: raceConversation.id,
          expectedVersion: 0,
          idempotencyKey: `claim-during-revoke-${randomUUID()}`,
          organizationId,
          principal: {
            email: 'identity-support@example.test',
            organizationId,
            role: 'SUPPORT',
            sessionId: randomUUID(),
            userId: supportMembership.userId,
          },
          storeId: store.id,
        }),
      ]),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(responses[0]?.body).toMatchObject({
      membershipId: supportMembershipId,
      status: 'revoked',
    });
    expect([2, 3]).toContain(
      (responses[0]?.body as { releasedConversationCount: number }).releasedConversationCount,
    );
    expect(['fulfilled', 'rejected']).toContain(claim[0]?.status);
    await request(baseUrl)
      .get('/auth/me')
      .set('authorization', `Bearer ${support.accessToken}`)
      .expect(401);
    expect(
      await prisma.organizationMembership.findUniqueOrThrow({ where: { id: supportMembershipId } }),
    ).toMatchObject({ status: 'REVOKED' });
    const released = await prisma.whatsAppConversation.findMany({
      where: { id: { in: [...assignedConversations.map(({ id }) => id), raceConversation.id] } },
    });
    expect(released.every(({ assignedMembershipId }) => assignedMembershipId === null)).toBe(true);
    expect(
      released
        .filter(({ id }) => assignedConversations.some((conversation) => conversation.id === id))
        .map(({ assignmentVersion }) => assignmentVersion),
    ).toEqual([2, 2]);
    expect(
      await prisma.whatsAppConversationAssignmentHistory.count({
        where: {
          conversationId: { in: released.map(({ id }) => id) },
          reasonCode: 'MEMBERSHIP_REVOKED',
        },
      }),
    ).toBe((responses[0]?.body as { releasedConversationCount: number }).releasedConversationCount);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: { in: released.map(({ id }) => id) },
          eventType: 'whatsapp.conversation.assignment.changed.v1',
          payloadJson: { path: ['reasonCode'], equals: 'membership_revoked' },
        },
      }),
    ).toBe((responses[0]?.body as { releasedConversationCount: number }).releasedConversationCount);
    expect(
      await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: foreignConversation.id },
      }),
    ).toMatchObject({ assignedMembershipId: foreignMembershipId, assignmentVersion: 1 });
    const releaseAudit = await prisma.auditLog.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { action: 'identity.membership.revoked', resourceId: supportMembershipId },
    });
    expect(releaseAudit.metadataJson).toMatchObject({
      releasedConversationCount: (responses[0]?.body as { releasedConversationCount: number })
        .releasedConversationCount,
    });
    expect(ownerMembership.id).not.toBe(supportMembershipId);
    const metrics = await request(baseUrl).get('/metrics').expect(200);
    expect(metrics.text).toContain('ecommerce_api_identity_operations_total');
    const evidence = JSON.stringify(
      await prisma.auditLog.findMany({ where: { action: { startsWith: 'identity.' } } }),
    );
    expect(evidence).not.toContain('identity-support@example.test');
    expect(evidence).not.toContain(key);
  });
});
