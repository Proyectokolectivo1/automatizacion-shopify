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
      NODE_ENV: 'development',
      OUTBOX_OPERATIONS_ENABLED: false,
      OUTBOX_OPERATIONS_KILL_SWITCH: true,
      POSTGRES_PORT: 5433,
      REDIS_PORT: 6380,
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
});
