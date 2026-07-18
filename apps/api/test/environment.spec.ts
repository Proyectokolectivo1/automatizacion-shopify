import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/environment.schema';

const validEnvironment = {
  MINIO_API_PORT: '9100',
  MINIO_HOST: '127.0.0.1',
  POSTGRES_DB: 'ecommerce',
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PASSWORD: 'not-a-real-secret',
  POSTGRES_PORT: '5433',
  POSTGRES_USER: 'ecommerce',
  REDIS_HOST: '127.0.0.1',
  REDIS_PASSWORD: 'not-a-real-secret',
  REDIS_PORT: '6380',
};

describe('parseEnvironment', () => {
  it('coerces validated ports and applies safe defaults', () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      API_HOST: '127.0.0.1',
      API_PORT: 3001,
      AUTH_ACCOUNT_ACTIONS_ENABLED: false,
      AUTH_ACCOUNT_ACTIONS_KILL_SWITCH: true,
      AUTH_INVITATION_TTL_SECONDS: 86_400,
      AUTH_PASSWORD_RESET_TTL_SECONDS: 1_800,
      DEPENDENCY_TIMEOUT_MS: 1500,
      IDENTITY_ADMIN_ENABLED: false,
      IDENTITY_ADMIN_KILL_SWITCH: true,
      IDENTITY_BOOTSTRAP_ENABLED: false,
      IDENTITY_BOOTSTRAP_KILL_SWITCH: true,
      MINIO_API_PORT: 9100,
      MINIO_USE_SSL: false,
      METRICS_ACCESS_MODE: 'loopback',
      NODE_ENV: 'development',
      OBSERVABILITY_ALERTS_ENABLED: false,
      OBSERVABILITY_ALERTS_KILL_SWITCH: true,
      OPERATIONAL_QUEUE_ENABLED: false,
      OPERATIONAL_QUEUE_KILL_SWITCH: true,
      OTEL_TRACE_SAMPLE_RATIO: 1,
      OTEL_TRACING_ENABLED: false,
      OTEL_TRACING_KILL_SWITCH: true,
      OUTBOX_OPERATIONS_ENABLED: false,
      OUTBOX_OPERATIONS_KILL_SWITCH: true,
      PAYMENT_EXPIRATION_DEFAULT_ACTION: 'MARK',
      PAYMENT_EXPIRATION_ENABLED: false,
      PAYMENT_EXPIRATION_KILL_SWITCH: true,
      PAYMENT_EXPIRATION_SIMULATION_MODE: true,
      WOMPI_RECONCILIATION_BATCH_SIZE: 25,
      WOMPI_RECONCILIATION_ENABLED: false,
      WOMPI_RECONCILIATION_INTERVAL_HOURS: 24,
      WOMPI_RECONCILIATION_KILL_SWITCH: true,
      WOMPI_RECONCILIATION_LOOKBACK_HOURS: 24,
      WOMPI_RECONCILIATION_SIMULATION_MODE: true,
      WHATSAPP_ASSIGNMENTS_ENABLED: false,
      WHATSAPP_ASSIGNMENTS_KILL_SWITCH: true,
      WHATSAPP_ASSIGNMENTS_SIMULATION_MODE: true,
      WHATSAPP_INBOX_ENABLED: false,
      WHATSAPP_INBOX_KILL_SWITCH: true,
      WHATSAPP_INBOX_SIMULATION_MODE: true,
      POSTGRES_PORT: 5433,
      REDIS_PORT: 6380,
      SHOPIFY_INTEGRATIONS_ENABLED: false,
      SHOPIFY_INTEGRATIONS_KILL_SWITCH: true,
      SHOPIFY_SIMULATION_MODE: true,
    });
    expect(parseEnvironment({ ...validEnvironment, MINIO_USE_SSL: 'true' }).MINIO_USE_SSL).toBe(
      true,
    );
  });

  it('fails without including a secret value in the error', () => {
    const secret = 'must-never-appear-in-errors';

    expect(() =>
      parseEnvironment({ ...validEnvironment, POSTGRES_PASSWORD: secret, REDIS_PORT: 'invalid' }),
    ).toThrowError(/REDIS_PORT/u);
    try {
      parseEnvironment({ ...validEnvironment, POSTGRES_PASSWORD: secret, REDIS_PORT: 'invalid' });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it('normalizes empty optional bootstrap values and accepts complete local credentials', () => {
    expect(
      parseEnvironment({
        ...validEnvironment,
        IDENTITY_BOOTSTRAP_EMAIL: ' ',
        IDENTITY_BOOTSTRAP_SECRET: '',
      }),
    ).toMatchObject({
      IDENTITY_BOOTSTRAP_EMAIL: undefined,
      IDENTITY_BOOTSTRAP_SECRET: undefined,
    });
    expect(
      parseEnvironment({
        ...validEnvironment,
        IDENTITY_BOOTSTRAP_EMAIL: 'owner@example.test',
        IDENTITY_BOOTSTRAP_ORGANIZATION_NAME: 'Local tenant',
        IDENTITY_BOOTSTRAP_PASSWORD: 'Correct-password-123',
        IDENTITY_BOOTSTRAP_SECRET: 'a'.repeat(32),
      }),
    ).toMatchObject({
      IDENTITY_BOOTSTRAP_EMAIL: 'owner@example.test',
      IDENTITY_BOOTSTRAP_ORGANIZATION_NAME: 'Local tenant',
      IDENTITY_BOOTSTRAP_SECRET: 'a'.repeat(32),
    });
  });

  it('accepts only explicit payment abandonment actions', () => {
    expect(
      parseEnvironment({ ...validEnvironment, PAYMENT_EXPIRATION_DEFAULT_ACTION: 'CANCEL' })
        .PAYMENT_EXPIRATION_DEFAULT_ACTION,
    ).toBe('CANCEL');
    expect(() =>
      parseEnvironment({ ...validEnvironment, PAYMENT_EXPIRATION_DEFAULT_ACTION: 'DELETE' }),
    ).toThrowError(/PAYMENT_EXPIRATION_DEFAULT_ACTION/u);
  });

  it('requires technical metrics authentication in production', () => {
    expect(() => parseEnvironment({ ...validEnvironment, NODE_ENV: 'production' })).toThrowError(
      /METRICS_ACCESS_MODE/u,
    );
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        METRICS_ACCESS_MODE: 'bearer',
        NODE_ENV: 'production',
      }),
    ).toThrowError(/METRICS_BEARER_TOKEN/u);
    expect(
      parseEnvironment({
        ...validEnvironment,
        METRICS_ACCESS_MODE: 'bearer',
        METRICS_BEARER_TOKEN: 'm'.repeat(32),
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ METRICS_ACCESS_MODE: 'bearer', NODE_ENV: 'production' });
  });

  it('rejects observability endpoints that can carry credentials or unsafe protocols', () => {
    const invalidEndpoints = [
      'file:///tmp/alerts',
      'http://user:secret@127.0.0.1:4318/v1/traces',
      'http://:secret@127.0.0.1:4318/v1/traces',
      'http://127.0.0.1:4318/v1/traces?token=secret',
      'http://127.0.0.1:4318/v1/traces#fragment',
    ];
    for (const endpoint of invalidEndpoints) {
      expect(() =>
        parseEnvironment({ ...validEnvironment, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint }),
      ).toThrowError(/OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/u);
    }
    expect(
      parseEnvironment({
        ...validEnvironment,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector.example.test/v1/traces',
      }).OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    ).toBe('https://collector.example.test/v1/traces');
  });
});
