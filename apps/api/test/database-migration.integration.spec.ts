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
          'webhook_events',
          'customers',
          'customer_addresses',
          'orders',
          'order_items',
          'order_classification_policies',
          'order_state_history',
          'order_reconciliation_issues',
          'reconciliation_checkpoints',
          'transport_rate_decisions',
          'transport_rate_policies',
          'transport_rate_rules',
          'payment_intents',
          'payment_provider_events',
          'payment_reminders',
          'whatsapp_templates',
          'whatsapp_conversations',
          'whatsapp_conversation_assignment_history',
          'whatsapp_messages',
          'whatsapp_inbound_webhook_events',
          'whatsapp_message_status_history',
          'whatsapp_status_webhook_events',
        ],
      ],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      'account_action_tokens',
      'audit_logs',
      'auth_rate_limits',
      'auth_sessions',
      'customer_addresses',
      'customers',
      'idempotency_keys',
      'integration_connections',
      'job_executions',
      'order_classification_policies',
      'order_items',
      'order_reconciliation_issues',
      'order_state_history',
      'orders',
      'organization_memberships',
      'organizations',
      'outbox_events',
      'payment_intents',
      'payment_provider_events',
      'payment_reminders',
      'reconciliation_checkpoints',
      'stores',
      'transport_rate_decisions',
      'transport_rate_policies',
      'transport_rate_rules',
      'users',
      'webhook_events',
      'whatsapp_conversation_assignment_history',
      'whatsapp_conversations',
      'whatsapp_inbound_webhook_events',
      'whatsapp_message_status_history',
      'whatsapp_messages',
      'whatsapp_status_webhook_events',
      'whatsapp_templates',
    ]);

    const migrations = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    expect(migrations.rows[0]?.count).toBe('28');
    const operationalIndexes = await database.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE indexname = ANY($1::text[]) ORDER BY indexname`,
      [
        [
          'order_reconciliation_issues_operational_queue_idx',
          'orders_operational_queue_idx',
          'payment_intents_operational_queue_idx',
          'payment_reconciliation_issues_operational_queue_idx',
          'whatsapp_conversations_operational_queue_idx',
        ],
      ],
    );
    expect(operationalIndexes.rows.map(({ indexname }) => indexname)).toHaveLength(5);
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
    await database.query(
      `UPDATE integration_connections
       SET encrypted_webhook_secret = $1::jsonb
       WHERE store_id = $2`,
      [JSON.stringify(validEnvelope), store.rows[0]?.id],
    );
    await expect(
      database.query(
        `UPDATE integration_connections
         SET encrypted_webhook_secret = '{"webhookSecret":"plaintext"}'::jsonb
         WHERE store_id = $1`,
        [store.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
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

  it('enforces WhatsApp configuration shape and globally unique phone identity', async () => {
    const first = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('WhatsApp Config Owner') RETURNING id`,
    );
    const second = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Other WhatsApp Config Owner') RETURNING id`,
    );
    const createStore = async (organizationId: string, label: string) =>
      database.query<{ id: string }>(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES ($1, $2, $3, 'America/Bogota', 'COP') RETURNING id`,
        [organizationId, label, `${label.toLowerCase().replaceAll(' ', '-')}.myshopify.com`],
      );
    const firstStore = await createStore(first.rows[0]?.id ?? '', 'WhatsApp Config One');
    const secondStore = await createStore(second.rows[0]?.id ?? '', 'WhatsApp Config Two');
    const envelope = JSON.stringify({
      authTag: 'encoded-auth-tag',
      ciphertext: 'encoded-ciphertext',
      iv: 'encoded-iv',
      version: 'v1',
    });
    const config = JSON.stringify({
      apiVersion: 'v99.0',
      businessAccountId: 'mock_waba_database',
      fixtureVersion: 'v1',
      mode: 'simulation',
      phoneNumberId: 'mock_phone_database',
    });
    await database.query(
      `INSERT INTO integration_connections
       (organization_id, store_id, provider, display_name, encrypted_credentials, config_json)
       VALUES ($1, $2, 'whatsapp', 'WhatsApp one', $3::jsonb, $4::jsonb)`,
      [first.rows[0]?.id, firstStore.rows[0]?.id, envelope, config],
    );
    await expect(
      database.query(
        `INSERT INTO integration_connections
         (organization_id, store_id, provider, display_name, encrypted_credentials, config_json)
         VALUES ($1, $2, 'whatsapp', 'WhatsApp duplicate phone', $3::jsonb, $4::jsonb)`,
        [second.rows[0]?.id, secondStore.rows[0]?.id, envelope, config],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.query(
        `INSERT INTO integration_connections
         (organization_id, store_id, provider, display_name, encrypted_credentials, config_json)
         VALUES ($1, $2, 'whatsapp', 'WhatsApp invalid config', $3::jsonb, '{}'::jsonb)`,
        [second.rows[0]?.id, secondStore.rows[0]?.id, envelope],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces immutable, tenant-safe and single-active WhatsApp template versions', async () => {
    const first = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('WhatsApp Template Owner') RETURNING id`,
    );
    const second = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Foreign Template Owner') RETURNING id`,
    );
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'WhatsApp Template Store', 'whatsapp-template-db.myshopify.com',
        'America/Bogota', 'COP') RETURNING id`,
      [first.rows[0]?.id],
    );
    const variables = JSON.stringify({
      variables: [{ name: 'customer_name', required: true, type: 'TEXT' }],
      version: 'v1',
    });
    const templateKey = randomUUID();
    const inserted = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_templates
       (organization_id, store_id, template_key, version, name, meta_template_name,
        language_code, category, body_template, variables_schema_json, event_type)
       VALUES ($1, $2, $3, 1, 'payment_pending', 'payment_pending', 'es_CO', 'utility',
        'Hola {{customer_name}}', $4::jsonb, 'payment.transport.pending') RETURNING id`,
      [first.rows[0]?.id, store.rows[0]?.id, templateKey, variables],
    );
    await expect(
      database.query(`UPDATE whatsapp_templates SET body_template = 'changed' WHERE id = $1`, [
        inserted.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_templates
         (organization_id, store_id, template_key, version, name, meta_template_name,
          language_code, category, body_template, variables_schema_json, event_type, active)
         VALUES ($1, $2, $3, 2, 'payment_pending', 'payment_pending_v2', 'es_CO', 'utility',
          'Hola {{customer_name}}', $4::jsonb, 'payment.transport.pending', true)`,
        [first.rows[0]?.id, store.rows[0]?.id, templateKey, variables],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_templates
         (organization_id, store_id, template_key, version, name, meta_template_name,
          language_code, category, body_template, variables_schema_json, event_type)
         VALUES ($1, $2, $3, 2, 'payment_pending', 'payment_pending_v2', 'es_CO', 'utility',
          'Hola {{customer_name}}', '{}'::jsonb, 'payment.transport.pending')`,
        [first.rows[0]?.id, store.rows[0]?.id, templateKey],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_templates
         (organization_id, store_id, template_key, version, name, meta_template_name,
          language_code, category, body_template, variables_schema_json, event_type)
         VALUES ($1, $2, $3, 1, 'cross_tenant', 'cross_tenant', 'es_CO', 'utility',
          'Hola {{customer_name}}', $4::jsonb, 'payment.transport.foreign')`,
        [second.rows[0]?.id, store.rows[0]?.id, randomUUID(), variables],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    const approvedValues = [first.rows[0]?.id, store.rows[0]?.id, variables];
    await database.query(
      `INSERT INTO whatsapp_templates
       (organization_id, store_id, template_key, version, name, meta_template_name,
        language_code, category, status, body_template, variables_schema_json, event_type,
        active, reviewed_at)
       VALUES ($1, $2, gen_random_uuid(), 1, 'active_one', 'active_one', 'en_US', 'utility',
        'simulated_approved', 'Hi {{customer_name}}', $3::jsonb, 'payment.transport.active',
        true, NOW())`,
      approvedValues,
    );
    await expect(
      database.query(
        `INSERT INTO whatsapp_templates
         (organization_id, store_id, template_key, version, name, meta_template_name,
          language_code, category, status, body_template, variables_schema_json, event_type,
          active, reviewed_at)
         VALUES ($1, $2, gen_random_uuid(), 1, 'active_two', 'active_two', 'en_US', 'utility',
          'simulated_approved', 'Hi {{customer_name}}', $3::jsonb, 'payment.transport.active',
          true, NOW())`,
        approvedValues,
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('enforces durable simulated WhatsApp conversations and immutable message content', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('WhatsApp Message Owner') RETURNING id`,
    );
    const organizationId = organization.rows[0]?.id;
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'WhatsApp Message Store', 'whatsapp-message-db.myshopify.com',
        'America/Bogota', 'COP') RETURNING id`,
      [organizationId],
    );
    const storeId = store.rows[0]?.id;
    const customer = await database.query<{ id: string }>(
      `INSERT INTO customers
       (organization_id, store_id, shopify_customer_id, phone_e164, data_processing_consent)
       VALUES ($1, $2, 'whatsapp-message-customer', '+573001112233', true) RETURNING id`,
      [organizationId, storeId],
    );
    const webhook = await database.query<{ id: string }>(
      `INSERT INTO webhook_events
       (organization_id, store_id, provider, external_event_id, event_type, api_version,
        headers_redacted_json, payload_redacted_json, payload_hash, triggered_at)
       VALUES ($1, $2, 'shopify', $3, 'orders/create', '2026-07', '{}', '{}', repeat('b', 64),
        NOW()) RETURNING id`,
      [organizationId, storeId, randomUUID()],
    );
    const order = await database.query<{ id: string }>(
      `INSERT INTO orders
       (organization_id, store_id, customer_id, source_webhook_event_id, shopify_order_id,
        shopify_order_name, currency, subtotal_amount, discount_amount, tax_amount, total_amount,
        source_created_at, source_updated_at, raw_snapshot_json)
       VALUES ($1, $2, $3, $4, 'whatsapp-message-order', '#WA-MSG', 'COP', 10000, 0, 0,
        10000, NOW(), NOW(), '{}') RETURNING id`,
      [organizationId, storeId, customer.rows[0]?.id, webhook.rows[0]?.id],
    );
    const template = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_templates
       (organization_id, store_id, template_key, version, name, meta_template_name, language_code,
        category, status, body_template, variables_schema_json, event_type, active, reviewed_at)
       VALUES ($1, $2, gen_random_uuid(), 1, 'message_dispatch', 'message_dispatch', 'es_CO',
        'utility', 'simulated_approved', 'Hola {{customer_name}}',
        '{"version":"v1","variables":[{"name":"customer_name","required":true,"type":"TEXT"}]}',
        'message.dispatch', true, NOW()) RETURNING id`,
      [organizationId, storeId],
    );
    const conversation = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_conversations
       (organization_id, store_id, customer_id, phone_e164, last_message_at)
       VALUES ($1, $2, $3, '+573001112233', NOW()) RETURNING id`,
      [organizationId, storeId, customer.rows[0]?.id],
    );
    const messageValues = [
      organizationId,
      storeId,
      conversation.rows[0]?.id,
      order.rows[0]?.id,
      template.rows[0]?.id,
      `simulated:${'c'.repeat(64)}`,
      'd'.repeat(64),
      'e'.repeat(64),
    ];
    const message = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_messages
       (organization_id, store_id, conversation_id, order_id, template_id, provider_message_id,
        body, metadata_json, business_key_hash, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, 'Hola Synthetic',
        '{"mode":"simulation","fixtureVersion":"v1"}', $7, $8) RETURNING id`,
      messageValues,
    );
    await expect(
      database.query(`UPDATE whatsapp_messages SET body = 'changed' WHERE id = $1`, [
        message.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_messages
         (organization_id, store_id, conversation_id, order_id, template_id, provider_message_id,
          body, metadata_json, business_key_hash, request_fingerprint)
         VALUES ($1, $2, $3, $4, $5, 'simulated:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          'Duplicate', '{"mode":"simulation","fixtureVersion":"v1"}', $6, $7)`,
        [...messageValues.slice(0, 5), ...messageValues.slice(6)],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_messages
         (organization_id, store_id, conversation_id, order_id, template_id, provider_message_id,
          body, metadata_json, business_key_hash, request_fingerprint, sent_at)
         VALUES ($1, $2, $3, $4, $5, 'simulated:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'Invalid sent', '{"mode":"simulation","fixtureVersion":"v1"}', repeat('1', 64),
          repeat('2', 64), NOW())`,
        messageValues.slice(0, 5),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await database.query(
      `UPDATE whatsapp_messages
       SET status = 'simulated_sent', sent_at = NOW()
       WHERE id = $1`,
      [message.rows[0]?.id],
    );
    const statusEvent = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_status_webhook_events
       (organization_id, store_id, message_id, external_event_id, event_type, fixture_version,
        observed_status, outcome, payload_hash, provider_message_id_hash, payload_redacted_json,
        occurred_at, received_at, processed_at)
       VALUES ($1, $2, $3, $4, 'message.status', 'v1', 'simulated_delivered', 'applied',
        repeat('3', 64), repeat('4', 64),
        '{"mode":"simulation","synthetic":true,"status":"delivered"}', NOW(), NOW(), NOW())
       RETURNING id`,
      [organizationId, storeId, message.rows[0]?.id, randomUUID()],
    );
    const statusHistory = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_message_status_history
       (organization_id, store_id, message_id, webhook_event_id, from_status, observed_status,
        resulting_status, applied, occurred_at)
       VALUES ($1, $2, $3, $4, 'simulated_sent', 'simulated_delivered',
        'simulated_delivered', true, NOW()) RETURNING id`,
      [organizationId, storeId, message.rows[0]?.id, statusEvent.rows[0]?.id],
    );
    await expect(
      database.query(
        `UPDATE whatsapp_status_webhook_events SET rejection_reason = 'changed' WHERE id = $1`,
        [statusEvent.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(`UPDATE whatsapp_message_status_history SET applied = false WHERE id = $1`, [
        statusHistory.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_status_webhook_events
         (organization_id, store_id, external_event_id, event_type, fixture_version,
          observed_status, outcome, rejection_reason, payload_hash, provider_message_id_hash,
          payload_redacted_json, occurred_at, received_at, processed_at)
         VALUES ($1, $2, $3, 'message.status', 'v1', 'simulated_read', 'ignored',
          'unknown_message', repeat('5', 64), repeat('6', 64),
          '{"mode":"simulation","synthetic":true,"providerMessageId":"leaked"}',
          NOW(), NOW(), NOW())`,
        [organizationId, storeId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_conversations
         (organization_id, store_id, customer_id, phone_e164, last_message_at)
         VALUES ($1, $2, $3, '3001112233', NOW())`,
        [organizationId, storeId, customer.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const unknownConversation = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_conversations
       (organization_id, store_id, contact_hash, last_message_at)
       VALUES ($1, $2, repeat('7', 64), NOW()) RETURNING id`,
      [organizationId, storeId],
    );
    const inboundMessage = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_messages
       (organization_id, store_id, conversation_id, provider_message_id, direction, type, status,
        encrypted_body_json, content_fingerprint, sender_hash, metadata_json, business_key_hash,
        request_fingerprint, received_at, retention_expires_at)
       VALUES ($1, $2, $3, $4, 'inbound', 'text', 'simulated_received',
        '{"authTag":"synthetic-tag","ciphertext":"synthetic-ciphertext","iv":"synthetic-iv","version":"v1"}',
        repeat('8', 64), repeat('7', 64),
        '{"mode":"simulation","fixtureVersion":"v1","contentEncrypted":true}',
        repeat('9', 64), repeat('a', 64), NOW(), NOW() + INTERVAL '30 days')
       RETURNING id`,
      [organizationId, storeId, unknownConversation.rows[0]?.id, `simulated:${'8'.repeat(64)}`],
    );
    const inboundEvent = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_inbound_webhook_events
       (organization_id, store_id, conversation_id, message_id, external_event_id, event_type,
        fixture_version, identity_resolution, outcome, payload_hash, provider_message_id_hash,
        sender_hash, payload_redacted_json, content_length, occurred_at, received_at, processed_at)
       VALUES ($1, $2, $3, $4, $5, 'message.received', 'v1', 'unknown_contact', 'accepted',
        repeat('b', 64), repeat('c', 64), repeat('7', 64),
        '{"mode":"simulation","synthetic":true,"contentLength":17}', 17, NOW(), NOW(), NOW())
       RETURNING id`,
      [
        organizationId,
        storeId,
        unknownConversation.rows[0]?.id,
        inboundMessage.rows[0]?.id,
        randomUUID(),
      ],
    );
    const secondInboundStore = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Second WhatsApp Inbound Store', 'whatsapp-inbound-second.myshopify.com',
        'America/Bogota', 'COP') RETURNING id`,
      [organizationId],
    );
    const secondUnknownConversation = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_conversations
       (organization_id, store_id, contact_hash, last_message_at)
       VALUES ($1, $2, repeat('6', 64), NOW()) RETURNING id`,
      [organizationId, secondInboundStore.rows[0]?.id],
    );
    await expect(
      database.query(
        `INSERT INTO whatsapp_messages
         (organization_id, store_id, conversation_id, provider_message_id, direction, type, status,
          encrypted_body_json, content_fingerprint, sender_hash, metadata_json, business_key_hash,
          request_fingerprint, received_at, retention_expires_at)
         VALUES ($1, $2, $3, $4, 'inbound', 'text', 'simulated_received',
          '{"authTag":"other-tag","ciphertext":"other-ciphertext","iv":"other-iv","version":"v1"}',
          repeat('5', 64), repeat('6', 64),
          '{"mode":"simulation","fixtureVersion":"v1","contentEncrypted":true}',
          repeat('4', 64), repeat('3', 64), NOW(), NOW() + INTERVAL '30 days')`,
        [
          organizationId,
          secondInboundStore.rows[0]?.id,
          secondUnknownConversation.rows[0]?.id,
          `simulated:${'8'.repeat(64)}`,
        ],
      ),
    ).resolves.toBeDefined();
    await expect(
      database.query(`UPDATE whatsapp_messages SET encrypted_body_json = '{}' WHERE id = $1`, [
        inboundMessage.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `UPDATE whatsapp_inbound_webhook_events SET outcome = 'duplicate' WHERE id = $1`,
        [inboundEvent.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_messages
         (organization_id, store_id, conversation_id, provider_message_id, direction, type, status,
          body, encrypted_body_json, content_fingerprint, sender_hash, metadata_json,
          business_key_hash, request_fingerprint, received_at, retention_expires_at)
         VALUES ($1, $2, $3, $4, 'inbound', 'text', 'simulated_received', 'plaintext leak',
          '{"authTag":"tag","ciphertext":"ciphertext","iv":"iv","version":"v1"}',
          repeat('d', 64), repeat('7', 64),
          '{"mode":"simulation","fixtureVersion":"v1"}', repeat('e', 64), repeat('f', 64),
          NOW(), NOW() + INTERVAL '30 days')`,
        [organizationId, storeId, unknownConversation.rows[0]?.id, `simulated:${'9'.repeat(64)}`],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_inbound_webhook_events
         (organization_id, store_id, conversation_id, message_id, external_event_id, event_type,
          fixture_version, identity_resolution, outcome, payload_hash, provider_message_id_hash,
          sender_hash, payload_redacted_json, content_length, occurred_at, received_at, processed_at)
         VALUES ($1, $2, $3, $4, $5, 'message.received', 'v1', 'unknown_contact', 'duplicate',
          repeat('1', 64), repeat('2', 64), repeat('3', 64),
          '{"mode":"simulation","synthetic":true,"text":"leaked"}', 6, NOW(), NOW(), NOW())`,
        [
          organizationId,
          storeId,
          unknownConversation.rows[0]?.id,
          inboundMessage.rows[0]?.id,
          randomUUID(),
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces tenant-safe and idempotent Shopify webhook persistence', async () => {
    const first = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Webhook Owner') RETURNING id`,
    );
    const second = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Foreign Webhook Owner') RETURNING id`,
    );
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Webhook Store', 'webhook-db.myshopify.com', 'America/Bogota', 'COP')
       RETURNING id`,
      [first.rows[0]?.id],
    );
    const values = [
      first.rows[0]?.id,
      store.rows[0]?.id,
      randomUUID(),
      'orders/create',
      '2026-07',
      '{}',
      '{}',
      'a'.repeat(64),
    ];
    await database.query(
      `INSERT INTO webhook_events
       (organization_id, store_id, provider, external_event_id, event_type, api_version,
        headers_redacted_json, payload_redacted_json, payload_hash, triggered_at)
       VALUES ($1, $2, 'shopify', $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())`,
      values,
    );
    await expect(
      database.query(
        `INSERT INTO webhook_events
         (organization_id, store_id, provider, external_event_id, event_type, api_version,
          headers_redacted_json, payload_redacted_json, payload_hash, triggered_at)
         VALUES ($1, $2, 'shopify', $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())`,
        values,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.query(
        `INSERT INTO webhook_events
         (organization_id, store_id, provider, external_event_id, event_type, api_version,
          headers_redacted_json, payload_redacted_json, payload_hash, triggered_at)
         VALUES ($1, $2, 'shopify', $3, 'orders/create', '2026-07', '{}', '{}', $4, NOW())`,
        [second.rows[0]?.id, store.rows[0]?.id, randomUUID(), 'b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces tenant ownership, money and identity constraints for normalized orders', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Order Owner') RETURNING id`,
    );
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Order Store', 'order-db.myshopify.com', 'America/Bogota', 'COP')
       RETURNING id`,
      [organization.rows[0]?.id],
    );
    const webhook = await database.query<{ id: string }>(
      `INSERT INTO webhook_events
       (organization_id, store_id, provider, external_event_id, event_type, api_version,
        headers_redacted_json, payload_redacted_json, payload_hash, provider_resource_id, triggered_at)
       VALUES ($1, $2, 'shopify', $3, 'orders/create', '2026-07', '{}', '{}', $4, 'order-1', NOW())
       RETURNING id`,
      [organization.rows[0]?.id, store.rows[0]?.id, randomUUID(), 'c'.repeat(64)],
    );
    const customer = await database.query<{ id: string }>(
      `INSERT INTO customers
       (organization_id, store_id, shopify_customer_id, email, phone_e164)
       VALUES ($1, $2, 'customer-1', 'synthetic@example.test', '+573001112233')
       RETURNING id`,
      [organization.rows[0]?.id, store.rows[0]?.id],
    );
    const address = await database.query<{ id: string }>(
      `INSERT INTO customer_addresses
       (organization_id, store_id, customer_id, shopify_address_id, address1, city, country_code,
        normalized_address)
       VALUES ($1, $2, $3, 'address-1', 'Calle 1', 'Bogota', 'CO', 'Calle 1, Bogota, CO')
       RETURNING id`,
      [organization.rows[0]?.id, store.rows[0]?.id, customer.rows[0]?.id],
    );
    const order = await database.query<{ id: string }>(
      `INSERT INTO orders
       (organization_id, store_id, customer_id, shipping_address_id, source_webhook_event_id,
        shopify_order_id, shopify_order_name, currency, subtotal_amount, discount_amount,
        tax_amount, total_amount, source_created_at, source_updated_at, raw_snapshot_json)
       VALUES ($1, $2, $3, $4, $5, 'order-1', '#ORDER-1', 'COP', 10000, 0, 0, 10000,
        NOW(), NOW(), '{"synthetic":true}') RETURNING id`,
      [
        organization.rows[0]?.id,
        store.rows[0]?.id,
        customer.rows[0]?.id,
        address.rows[0]?.id,
        webhook.rows[0]?.id,
      ],
    );
    await database.query(
      `INSERT INTO order_items
       (organization_id, store_id, order_id, shopify_line_item_id, product_name, quantity,
        unit_price_amount, total_price_amount, snapshot_json)
       VALUES ($1, $2, $3, 'line-1', 'Synthetic item', 1, 10000, 10000, '{"synthetic":true}')`,
      [organization.rows[0]?.id, store.rows[0]?.id, order.rows[0]?.id],
    );
    const policy = {
      rules: [
        {
          financialStatuses: ['paid'],
          id: 'prepaid-paid',
          paymentMode: 'prepaid',
          priority: 100,
        },
      ],
      schemaVersion: 1,
    };
    await database.query(
      `INSERT INTO order_classification_policies
       (organization_id, store_id, version, active, rules_json, activated_at)
       VALUES ($1, $2, 1, true, $3::jsonb, NOW())`,
      [organization.rows[0]?.id, store.rows[0]?.id, JSON.stringify(policy)],
    );
    await expect(
      database.query(
        `INSERT INTO order_classification_policies
         (organization_id, store_id, version, active, rules_json, activated_at)
         VALUES ($1, $2, 2, true, $3::jsonb, NOW())`,
        [organization.rows[0]?.id, store.rows[0]?.id, JSON.stringify(policy)],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const history = await database.query<{ id: string }>(
      `INSERT INTO order_state_history
       (organization_id, store_id, order_id, from_state, to_state, trigger_type, trigger_id, reason)
       VALUES ($1, $2, $3, 'received', 'validating', 'database_test', $4, 'test_transition')
       RETURNING id`,
      [organization.rows[0]?.id, store.rows[0]?.id, order.rows[0]?.id, randomUUID()],
    );
    await expect(
      database.query(`UPDATE order_state_history SET reason = 'changed' WHERE id = $1`, [
        history.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(`DELETE FROM order_state_history WHERE id = $1`, [history.rows[0]?.id]),
    ).rejects.toMatchObject({ code: 'P0001' });
    await database.query(
      `INSERT INTO reconciliation_checkpoints
       (organization_id, store_id, provider, window_started_at, window_ended_at, last_run_at)
       VALUES ($1, $2, 'shopify', NOW() - INTERVAL '1 hour', NOW(), NOW())`,
      [organization.rows[0]?.id, store.rows[0]?.id],
    );
    await expect(
      database.query(
        `INSERT INTO reconciliation_checkpoints
         (organization_id, store_id, provider, window_started_at, window_ended_at, last_run_at)
         VALUES ($1, $2, 'shopify', NOW() - INTERVAL '1 hour', NOW(), NOW())`,
        [organization.rows[0]?.id, store.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await database.query(
      `INSERT INTO order_reconciliation_issues
       (organization_id, store_id, provider, issue_type, fingerprint, provider_resource_id)
       VALUES ($1, $2, 'shopify', 'missing_order', repeat('d', 64), 'missing-order')`,
      [organization.rows[0]?.id, store.rows[0]?.id],
    );
    await expect(
      database.query(
        `UPDATE order_reconciliation_issues SET status = 'resolved'
         WHERE store_id = $1 AND fingerprint = repeat('d', 64)`,
        [store.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(`UPDATE webhook_events SET reconciliation_generated = true WHERE id = $1`, [
        webhook.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(`UPDATE orders SET total_amount = -1 WHERE id = $1`, [order.rows[0]?.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO order_items
         (organization_id, store_id, order_id, shopify_line_item_id, product_name, quantity,
          unit_price_amount, total_price_amount, snapshot_json)
         VALUES ($1, $2, $3, 'line-2', 'Cross tenant item', 1, 1, 1, '{}')`,
        [randomUUID(), store.rows[0]?.id, order.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
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

  it('enforces versioned transport rate scopes, validity and positive COP amounts', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Rate Constraint Organization') RETURNING id`,
    );
    const organizationId = organization.rows[0]?.id;
    const policy = await database.query<{ id: string }>(
      `INSERT INTO transport_rate_policies
       (organization_id, version, currency, active, activated_at)
       VALUES ($1, 1, 'COP', true, NOW()) RETURNING id`,
      [organizationId],
    );
    await expect(
      database.query(
        `INSERT INTO transport_rate_policies
         (organization_id, version, currency, active, activated_at)
         VALUES ($1, 2, 'COP', true, NOW())`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.query(
        `INSERT INTO transport_rate_rules
         (organization_id, policy_id, rule_key, priority, amount)
         VALUES ($1, $2, 'invalid-amount', 1, 0)`,
        [organizationId, policy.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO transport_rate_rules
         (organization_id, policy_id, rule_key, priority, amount, valid_from, valid_to)
         VALUES ($1, $2, 'invalid-window', 1, 100, NOW(), NOW() - INTERVAL '1 hour')`,
        [organizationId, policy.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO transport_rate_policies
         (organization_id, version, currency)
         VALUES ($1, 3, 'USD')`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces Wompi payment intent ownership, amount, currency and expiration', async () => {
    const organization = await database.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ('Payment Constraint Organization') RETURNING id`,
    );
    const organizationId = organization.rows[0]?.id;
    const store = await database.query<{ id: string }>(
      `INSERT INTO stores
       (organization_id, name, shopify_shop_domain, timezone, currency)
       VALUES ($1, 'Payment Store', 'payment-constraints.myshopify.com', 'America/Bogota', 'COP')
       RETURNING id`,
      [organizationId],
    );
    const webhook = await database.query<{ id: string }>(
      `INSERT INTO webhook_events
       (organization_id, store_id, provider, external_event_id, event_type, api_version,
        headers_redacted_json, payload_redacted_json, payload_hash, triggered_at)
       VALUES ($1, $2, 'shopify', $3, 'orders/create', '2026-07', '{}', '{}', repeat('e', 64), NOW())
       RETURNING id`,
      [organizationId, store.rows[0]?.id, randomUUID()],
    );
    const order = await database.query<{ id: string }>(
      `INSERT INTO orders
       (organization_id, store_id, source_webhook_event_id, shopify_order_id, shopify_order_name,
        payment_mode, current_state, currency, subtotal_amount, discount_amount, tax_amount,
        total_amount, transport_charge_amount, raw_snapshot_json, source_created_at, source_updated_at)
       VALUES ($1, $2, $3, $4, '#PAY-1', 'cod', 'pending_transport_payment', 'COP',
        1000, 0, 0, 1000, 100, '{}', NOW(), NOW()) RETURNING id`,
      [organizationId, store.rows[0]?.id, webhook.rows[0]?.id, randomUUID()],
    );
    await expect(
      database.query(
        `INSERT INTO payment_intents
         (organization_id, store_id, order_id, external_reference, checkout_url, amount, currency,
          expires_at, attempt_number, idempotency_key)
         VALUES ($1, $2, $3, 'invalid-amount', 'https://example.invalid', 0, 'COP',
          NOW() + INTERVAL '1 hour', 1, $4)`,
        [organizationId, store.rows[0]?.id, order.rows[0]?.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO payment_intents
         (organization_id, store_id, order_id, external_reference, checkout_url, amount, currency,
          expires_at, attempt_number, idempotency_key)
         VALUES ($1, $2, $3, 'invalid-currency', 'https://example.invalid', 100, 'USD',
          NOW() + INTERVAL '1 hour', 1, $4)`,
        [organizationId, store.rows[0]?.id, order.rows[0]?.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO payment_intents
         (organization_id, store_id, order_id, external_reference, checkout_url, amount, currency,
          expires_at, attempt_number, idempotency_key)
         VALUES ($1, $2, $3, 'expired', 'https://example.invalid', 100, 'COP',
          NOW() - INTERVAL '1 hour', 1, $4)`,
        [organizationId, store.rows[0]?.id, order.rows[0]?.id, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const intent = await database.query<{ id: string }>(
      `INSERT INTO payment_intents
       (organization_id, store_id, order_id, external_reference, checkout_url, amount, currency,
        expires_at, attempt_number, idempotency_key)
       VALUES ($1, $2, $3, 'valid-reminders', 'https://example.invalid', 100, 'COP',
        NOW() + INTERVAL '24 hours', 1, $4) RETURNING id`,
      [organizationId, store.rows[0]?.id, order.rows[0]?.id, randomUUID()],
    );
    await expect(
      database.query(
        `INSERT INTO payment_reminders
         (organization_id, store_id, payment_intent_id, sequence, scheduled_at)
         VALUES ($1, $2, $3, 3, NOW() + INTERVAL '8 hours')`,
        [organizationId, store.rows[0]?.id, intent.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO payment_reminders
         (organization_id, store_id, payment_intent_id, sequence, scheduled_at, status)
         VALUES ($1, $2, $3, 1, NOW() + INTERVAL '8 hours', 'requested')`,
        [organizationId, store.rows[0]?.id, intent.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(`UPDATE payment_intents SET status = 'expired' WHERE id = $1`, [
        intent.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await database.query(
      `UPDATE payment_intents SET status = 'expired', expired_at = NOW() WHERE id = $1`,
      [intent.rows[0]?.id],
    );
    await expect(
      database.query(`UPDATE payment_intents SET expired_at = NULL WHERE id = $1`, [
        intent.rows[0]?.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await database.query(
      `UPDATE orders SET current_state = 'transport_payment_expired' WHERE id = $1`,
      [order.rows[0]?.id],
    );
    await database.query(
      `UPDATE orders SET current_state = 'abandono_pago_transporte' WHERE id = $1`,
      [order.rows[0]?.id],
    );
  });

  it('enforces tenant-safe current assignments and immutable assignment history', async () => {
    const [organization, foreignOrganization] = await Promise.all([
      database.query<{ id: string }>(
        `INSERT INTO organizations (name) VALUES ('Assignment Owner') RETURNING id`,
      ),
      database.query<{ id: string }>(
        `INSERT INTO organizations (name) VALUES ('Foreign Assignment Owner') RETURNING id`,
      ),
    ]);
    const organizationId = organization.rows[0]?.id;
    const foreignOrganizationId = foreignOrganization.rows[0]?.id;
    const [store, foreignStore] = await Promise.all([
      database.query<{ id: string }>(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES ($1, 'Assignment Store', 'assignment-constraints.myshopify.com',
          'America/Bogota', 'COP') RETURNING id`,
        [organizationId],
      ),
      database.query<{ id: string }>(
        `INSERT INTO stores
         (organization_id, name, shopify_shop_domain, timezone, currency)
         VALUES ($1, 'Foreign Assignment Store', 'foreign-assignment-constraints.myshopify.com',
          'America/Bogota', 'COP') RETURNING id`,
        [foreignOrganizationId],
      ),
    ]);
    const createMembership = async (
      email: string,
      targetOrganizationId: string,
      role: 'owner' | 'support',
    ) => {
      const user = await database.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, password_parameters_json)
         VALUES ($1, 'argon-hash', '{}') RETURNING id`,
        [email],
      );
      return database.query<{ id: string }>(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3) RETURNING id`,
        [targetOrganizationId, user.rows[0]?.id, role],
      );
    };
    const [actor, agent, foreignAgent] = await Promise.all([
      createMembership('assignment-owner@example.test', organizationId ?? '', 'owner'),
      createMembership('assignment-support@example.test', organizationId ?? '', 'support'),
      createMembership('assignment-foreign@example.test', foreignOrganizationId ?? '', 'support'),
    ]);
    const customer = await database.query<{ id: string }>(
      `INSERT INTO customers
       (organization_id, store_id, shopify_customer_id, phone_e164, data_processing_consent)
       VALUES ($1, $2, 'assignment-customer', '+573001110099', true) RETURNING id`,
      [organizationId, store.rows[0]?.id],
    );
    const conversation = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_conversations
       (organization_id, store_id, customer_id, phone_e164, last_message_at)
       VALUES ($1, $2, $3, '+573001110099', NOW()) RETURNING id`,
      [organizationId, store.rows[0]?.id, customer.rows[0]?.id],
    );
    await database.query(
      `UPDATE whatsapp_conversations
       SET assigned_membership_id = $1, assignment_version = 1, assigned_at = NOW()
       WHERE id = $2`,
      [actor.rows[0]?.id, conversation.rows[0]?.id],
    );
    const history = await database.query<{ id: string }>(
      `INSERT INTO whatsapp_conversation_assignment_history
       (organization_id, store_id, conversation_id, version, action, actor_membership_id,
        new_assignee_membership_id)
       VALUES ($1, $2, $3, 1, 'claim', $4, $4) RETURNING id`,
      [organizationId, store.rows[0]?.id, conversation.rows[0]?.id, actor.rows[0]?.id],
    );
    await expect(
      database.query(
        `UPDATE whatsapp_conversations
         SET assigned_membership_id = $1
         WHERE id = $2`,
        [foreignAgent.rows[0]?.id, conversation.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      database.query(
        `UPDATE whatsapp_conversations
         SET assigned_membership_id = NULL, assigned_at = NOW()
         WHERE id = $1`,
        [conversation.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_conversation_assignment_history
         (organization_id, store_id, conversation_id, version, action, actor_membership_id,
          previous_assignee_membership_id, new_assignee_membership_id)
         VALUES ($1, $2, $3, 2, 'reassign', $4, $4, $5)`,
        [
          organizationId,
          store.rows[0]?.id,
          conversation.rows[0]?.id,
          actor.rows[0]?.id,
          agent.rows[0]?.id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await database.query(
      `INSERT INTO whatsapp_conversation_assignment_history
       (organization_id, store_id, conversation_id, version, action, actor_membership_id,
        previous_assignee_membership_id, new_assignee_membership_id, reason_code)
       VALUES ($1, $2, $3, 2, 'reassign', $4, $4, $5, 'specialist_routing')`,
      [
        organizationId,
        store.rows[0]?.id,
        conversation.rows[0]?.id,
        actor.rows[0]?.id,
        agent.rows[0]?.id,
      ],
    );
    await expect(
      database.query(
        `UPDATE whatsapp_conversation_assignment_history SET version = 99 WHERE id = $1`,
        [history.rows[0]?.id],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.query(
        `INSERT INTO whatsapp_conversation_assignment_history
         (organization_id, store_id, conversation_id, version, action, actor_membership_id,
          previous_assignee_membership_id, reason_code)
         VALUES ($1, $2, $3, 3, 'unassign', $4, $5, 'manual_release')`,
        [
          foreignOrganizationId,
          foreignStore.rows[0]?.id,
          conversation.rows[0]?.id,
          foreignAgent.rows[0]?.id,
          foreignAgent.rows[0]?.id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces durable and tenant-safe Wompi reconciliation records', async () => {
    const intent = await database.query<{
      id: string;
      organization_id: string;
      store_id: string;
    }>(
      `SELECT id, organization_id, store_id
       FROM payment_intents
       WHERE external_reference = 'valid-reminders'`,
    );
    const paymentIntent = intent.rows[0];
    if (paymentIntent === undefined) throw new Error('Expected payment fixture is missing');
    const checkpoint = await database.query<{ id: string }>(
      `INSERT INTO payment_reconciliation_checkpoints
       (organization_id, store_id, provider, window_started_at, window_ended_at, last_run_at,
        next_run_at)
       VALUES ($1, $2, 'wompi', NOW() - INTERVAL '24 hours', NOW(), NOW(),
        NOW() + INTERVAL '24 hours') RETURNING id`,
      [paymentIntent.organization_id, paymentIntent.store_id],
    );
    const run = await database.query<{ id: string }>(
      `INSERT INTO payment_reconciliation_runs
       (organization_id, store_id, checkpoint_id, provider, status, window_started_at,
        window_ended_at, scanned_count, difference_count, new_issue_count, resolved_count,
        report_json, started_at, completed_at)
       VALUES ($1, $2, $3, 'wompi', 'completed', NOW() - INTERVAL '24 hours', NOW(),
        1, 1, 1, 0, '{"mode":"simulation"}', NOW(), NOW()) RETURNING id`,
      [paymentIntent.organization_id, paymentIntent.store_id, checkpoint.rows[0]?.id],
    );
    const issueValues = [
      paymentIntent.organization_id,
      paymentIntent.store_id,
      paymentIntent.id,
      run.rows[0]?.id,
      'f'.repeat(64),
    ];
    await database.query(
      `INSERT INTO payment_reconciliation_issues
       (organization_id, store_id, payment_intent_id, last_detected_run_id, provider, issue_type,
        fingerprint, local_status, authoritative_status, detail_json)
       VALUES ($1, $2, $3, $4, 'wompi', 'intent_status_mismatch', $5, 'expired', 'pending',
        '{"mode":"simulation"}')`,
      issueValues,
    );
    await expect(
      database.query(
        `INSERT INTO payment_reconciliation_issues
         (organization_id, store_id, payment_intent_id, last_detected_run_id, provider, issue_type,
          fingerprint, detail_json)
         VALUES ($1, $2, $3, $4, 'wompi', 'intent_status_mismatch', $5, '{}')`,
        issueValues,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.query(
        `UPDATE payment_reconciliation_issues
         SET status = 'resolved', resolved_at = NULL WHERE fingerprint = $1`,
        ['f'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database.query(
        `INSERT INTO payment_reconciliation_checkpoints
         (organization_id, store_id, provider, window_started_at, window_ended_at, last_run_at,
          next_run_at)
         VALUES ($1, $2, 'wompi', NOW(), NOW(), NOW(), NOW())`,
        [paymentIntent.organization_id, paymentIntent.store_id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
