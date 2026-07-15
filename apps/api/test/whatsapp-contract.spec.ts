import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AuditService } from '../src/auth/audit.service';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { EnvironmentService } from '../src/config/environment.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { MetricsService } from '../src/observability/metrics.service';
import type { RequestContextService } from '../src/observability/request-context.service';
import { WhatsAppCredentialCipher } from '../src/whatsapp/whatsapp-credential-cipher';
import { WhatsAppIntegrationService } from '../src/whatsapp/whatsapp-integration.service';
import { WhatsAppMockProvider } from '../src/whatsapp/whatsapp-mock.provider';

const environmentBase = {
  MINIO_API_PORT: '9100',
  MINIO_HOST: '127.0.0.1',
  POSTGRES_DB: 'ecommerce',
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PASSWORD: 'local-only',
  POSTGRES_PORT: '5433',
  POSTGRES_USER: 'ecommerce',
  REDIS_HOST: '127.0.0.1',
  REDIS_PASSWORD: 'local-only',
  REDIS_PORT: '6380',
};

const setEnvironment = (values: Record<string, string>): (() => void) => {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({ ...environmentBase, ...values })) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
};

const principal: AuthPrincipal = {
  email: 'owner@example.test',
  organizationId: randomUUID(),
  role: 'OWNER',
  sessionId: randomUUID(),
  userId: randomUUID(),
};

describe('WhatsApp simulated provider contract and security controls', () => {
  it('returns deterministic simulated metadata and never returns the token', async () => {
    const provider = new WhatsAppMockProvider();
    const probe = {
      accessToken: 'mock-whatsapp-valid-token',
      apiVersion: 'v99.0',
      businessAccountId: 'mock_waba_contract',
      phoneNumberId: 'mock_phone_contract',
    };
    const first = await provider.testConnection(probe);
    expect(await provider.testConnection(probe)).toEqual(first);
    expect(first).toMatchObject({ fixtureVersion: 'v1', healthy: true, mode: 'simulation' });
    expect(JSON.stringify(first)).not.toContain(probe.accessToken);
    await expect(
      provider.testConnection({ ...probe, accessToken: 'mock-whatsapp-invalid-token' }),
    ).resolves.toMatchObject({ healthy: false, mode: 'simulation' });
  });

  it('encrypts with WhatsApp tenant/store AAD and decrypts old key versions', () => {
    const v1 = randomBytes(32).toString('base64url');
    const v2 = randomBytes(32).toString('base64url');
    const restoreV1 = setEnvironment({
      WHATSAPP_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1 }),
      WHATSAPP_CREDENTIAL_KEY_VERSION: 'v1',
    });
    const organizationId = randomUUID();
    const storeId = randomUUID();
    const token = 'whatsapp-secret-never-persist-plain';
    const envelope = new WhatsAppCredentialCipher(new EnvironmentService()).encrypt(
      token,
      organizationId,
      storeId,
    );
    restoreV1();
    expect(JSON.stringify(envelope)).not.toContain(token);

    const restoreV2 = setEnvironment({
      WHATSAPP_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1, v2 }),
      WHATSAPP_CREDENTIAL_KEY_VERSION: 'v2',
    });
    const rotatedCipher = new WhatsAppCredentialCipher(new EnvironmentService());
    expect(rotatedCipher.decrypt(envelope, organizationId, storeId)).toBe(token);
    expect(rotatedCipher.encrypt('new-whatsapp-token-value', organizationId, storeId).version).toBe(
      'v2',
    );
    expect(() => rotatedCipher.decrypt(envelope, organizationId, randomUUID())).toThrow(
      /decryption failed/u,
    );
    restoreV2();
  });

  it.each([
    { enabled: 'false', killSwitch: 'false', simulation: 'true' },
    { enabled: 'true', killSwitch: 'true', simulation: 'true' },
    { enabled: 'true', killSwitch: 'false', simulation: 'false' },
  ])('fails closed with controls $enabled/$killSwitch/$simulation', async (controls) => {
    const restore = setEnvironment({
      WHATSAPP_INTEGRATIONS_ENABLED: controls.enabled,
      WHATSAPP_INTEGRATIONS_KILL_SWITCH: controls.killSwitch,
      WHATSAPP_SIMULATION_MODE: controls.simulation,
    });
    try {
      const service = new WhatsAppIntegrationService(
        {} as AuditService,
        {} as WhatsAppCredentialCipher,
        new EnvironmentService(),
        {} as MetricsService,
        {} as PrismaService,
        {} as RequestContextService,
        new WhatsAppMockProvider(),
      );
      await expect(
        service.configure({
          accessToken: 'mock-whatsapp-valid-token',
          apiVersion: 'v99.0',
          businessAccountId: 'mock_waba_closed',
          displayName: 'Closed simulated channel',
          idempotencyKey: 'closed-whatsapp-operation-key',
          organizationId: principal.organizationId,
          phoneNumberId: 'mock_phone_closed',
          principal,
          storeId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      restore();
    }
  });
});
