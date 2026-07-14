import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironmentFiles } from '../src/config/load-environment';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnvironmentFiles();

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing test database configuration: ${name}`);
  }
  return value;
};

const adminConfig = {
  database: required('POSTGRES_DB'),
  host: required('POSTGRES_HOST'),
  password: required('POSTGRES_PASSWORD'),
  port: Number(required('POSTGRES_PORT')),
  user: required('POSTGRES_USER'),
};
const databaseName = `ecommerce_migration_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = `postgresql://${encodeURIComponent(adminConfig.user)}:${encodeURIComponent(
  adminConfig.password,
)}@${adminConfig.host}:${adminConfig.port}/${databaseName}`;
const apiDirectory = process.cwd();
const prismaCli = createRequire(resolve(apiDirectory, 'package.json')).resolve(
  'prisma/build/index.js',
);

const runPrisma = (...arguments_: string[]): string =>
  execFileSync(process.execPath, [prismaCli, ...arguments_, '--config', 'prisma.config.ts'], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

describe('initial database migration', () => {
  let database: Client;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const admin = new Client(adminConfig);
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.end();

    runPrisma('migrate', 'deploy');
    runPrisma('migrate', 'deploy');

    database = new Client({ ...adminConfig, database: databaseName });
    await database.connect();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
    if (database !== undefined) {
      await database.end();
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

  it('applies once from empty and is a no-op when deployed again', async () => {
    const tables = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [
        [
          'organizations',
          'stores',
          'idempotency_keys',
          'outbox_events',
          'job_executions',
          'users',
          'organization_memberships',
          'auth_sessions',
          'auth_rate_limits',
          'audit_logs',
          'account_action_tokens',
          'integration_connections',
        ],
      ],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      'account_action_tokens',
      'audit_logs',
      'auth_rate_limits',
      'auth_sessions',
      'idempotency_keys',
      'integration_connections',
      'job_executions',
      'organization_memberships',
      'organizations',
      'outbox_events',
      'stores',
      'users',
    ]);

    const migrations = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    expect(migrations.rows[0]?.count).toBe('8');
    expect(runPrisma('migrate', 'status')).toContain('Database schema is up to date');
    expect(
      runPrisma(
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ),
    ).toContain('No difference detected');
    await expect(prisma.organization.count()).resolves.toBe(0);
  });

  it('enforces organization ownership, canonical Shopify domains and ISO currency', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Test Organization') RETURNING id`,
    );
    const organizationId = organization.rows[0]?.id;
    expect(organizationId).toBeDefined();

    await database.query(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Primary Store', 'primary-test.myshopify.com', 'America/Bogota', 'COP')`,
      [organizationId],
    );

    await expect(
      database.query(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES ($1, 'Duplicate', 'primary-test.myshopify.com', 'America/Bogota', 'COP')`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await expect(
      database.query(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES (gen_random_uuid(), 'Orphan', 'orphan.myshopify.com', 'America/Bogota', 'COP')`,
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      database.query(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES ($1, 'Invalid', 'UPPER.myshopify.com', 'America/Bogota', 'cop')`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects duplicate idempotency keys inside the same scope', async () => {
    const values = ['shopify:webhook', 'shopify:store:orders/create:1', 'sha256:test'];
    await database.query(
      `INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
      values,
    );
    await expect(
      database.query(
        `INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
        values,
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('enforces tenant ownership and encrypted credential envelope shape', async () => {
    const first = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Integration Owner') RETURNING id`,
    );
    const second = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Foreign Integration Owner') RETURNING id`,
    );
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Encrypted Store', 'encrypted-store.myshopify.com', 'America/Bogota', 'COP')
       RETURNING id`,
      [first.rows[0]?.id],
    );
    const validEnvelope = {
      authTag: 'encoded-auth-tag',
      ciphertext: 'encoded-ciphertext',
      iv: 'encoded-iv',
      version: 'v1',
    };
    await database.query(
      `INSERT INTO integration_connections
       (organization_id, store_id, provider, display_name, encrypted_credentials)
       VALUES ($1, $2, 'shopify', 'Encrypted connection', $3::jsonb)`,
      [first.rows[0]?.id, store.rows[0]?.id, JSON.stringify(validEnvelope)],
    );
    await expect(
      database.query(
        `INSERT INTO integration_connections
         (organization_id, store_id, provider, display_name, encrypted_credentials)
         VALUES ($1, $2, 'wompi', 'Cross tenant', $3::jsonb)`,
        [second.rows[0]?.id, store.rows[0]?.id, JSON.stringify(validEnvelope)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      database.query(
        `INSERT INTO integration_connections
         (organization_id, store_id, provider, display_name, encrypted_credentials)
         VALUES ($1, $2, 'wompi', 'Plain credential', $3::jsonb)`,
        [first.rows[0]?.id, store.rows[0]?.id, JSON.stringify({ accessToken: 'plaintext' })],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces outbox retry counters and published-state consistency', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Outbox Organization') RETURNING id`,
    );
    const aggregateId = organization.rows[0]?.id;
    await database.query(
      `INSERT INTO outbox_events
       (organization_id, aggregate_type, aggregate_id, event_type, payload_json, correlation_id)
       VALUES ($1, 'organization', $1, 'organization.created', '{"version":1}', $2)`,
      [aggregateId, randomUUID()],
    );

    await expect(
      database.query(
        `INSERT INTO outbox_events
         (organization_id, aggregate_type, aggregate_id, event_type, payload_json, correlation_id, attempt_count)
         VALUES ($1, 'organization', $1, 'organization.created', '{}', $2, -1)`,
        [aggregateId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      database.query(
        `INSERT INTO outbox_events
         (organization_id, aggregate_type, aggregate_id, event_type, payload_json, correlation_id, status)
         VALUES ($1, 'organization', $1, 'organization.created', '{}', $2, 'published')`,
        [aggregateId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      database.query(
        `INSERT INTO outbox_events
         (aggregate_type, aggregate_id, event_type, payload_json, correlation_id)
         VALUES ('organization', $1, 'organization.created', '{}', $2)`,
        [aggregateId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces one-use account action token purpose shapes and hash format', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Token Organization') RETURNING id`,
    );
    const user = await database.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, password_parameters_json)
       VALUES ('token-user@example.test', 'argon-hash', '{}') RETURNING id`,
    );
    await expect(
      database.query(
        `INSERT INTO account_action_tokens
         (purpose, token_hash, organization_id, user_id, expires_at)
         VALUES ('password_reset', 'not-a-hash', $1, $2, NOW() + INTERVAL '1 hour')`,
        [organization.rows[0]?.id, user.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await database.query(
      `INSERT INTO account_action_tokens
       (purpose, token_hash, user_id, expires_at)
       VALUES ('password_reset', repeat('a', 64), $1, NOW() + INTERVAL '1 hour')`,
      [user.rows[0]?.id],
    );
    await expect(
      database.query(
        `UPDATE account_action_tokens
         SET consumed_at = NOW(), revoked_at = NOW()
         WHERE token_hash = repeat('a', 64)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
