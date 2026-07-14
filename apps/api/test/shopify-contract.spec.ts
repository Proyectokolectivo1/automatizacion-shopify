import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AuditService } from '../src/auth/audit.service';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { EnvironmentService } from '../src/config/environment.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { MetricsService } from '../src/observability/metrics.service';
import type { RequestContextService } from '../src/observability/request-context.service';
import { ShopifyCredentialCipher } from '../src/shopify/shopify-credential-cipher';
import { normalizeShopifyDomain } from '../src/shopify/shopify-domain';
import { ShopifyIntegrationService } from '../src/shopify/shopify-integration.service';
import { ShopifyMockProvider } from '../src/shopify/shopify-mock.provider';

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

describe('Shopify simulated provider contract and security controls', () => {
  it('normalizes only permanent Shopify domains and rejects SSRF-shaped input', () => {
    expect(normalizeShopifyDomain('  SAFE-STORE.MyShopify.Com. ')).toBe('safe-store.myshopify.com');
    for (const unsafe of [
      'https://safe-store.myshopify.com',
      'safe-store.myshopify.com/path',
      'localhost',
      '127.0.0.1',
      'safe-store.myshopify.com.evil.test',
      '-unsafe.myshopify.com',
    ]) {
      expect(() => normalizeShopifyDomain(unsafe)).toThrow(/Invalid Shopify/u);
    }
  });

  it('returns a deterministic and explicitly simulated provider result', async () => {
    const provider = new ShopifyMockProvider();
    const probe = { accessToken: 'mock-valid-token-value', shopDomain: 'safe.myshopify.com' };
    const first = await provider.testConnection(probe);
    expect(await provider.testConnection(probe)).toEqual(first);
    expect(first).toMatchObject({ fixtureVersion: 'v1', healthy: true, mode: 'simulation' });
    expect(JSON.stringify(first)).not.toContain(probe.accessToken);
    await expect(
      provider.testConnection({ ...probe, accessToken: 'mock-invalid-token' }),
    ).resolves.toMatchObject({ healthy: false, mode: 'simulation' });
  });

  it('encrypts with tenant/store AAD and decrypts old versions during key rotation', () => {
    const v1 = randomBytes(32).toString('base64url');
    const v2 = randomBytes(32).toString('base64url');
    const restoreV1 = setEnvironment({
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1 }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v1',
    });
    const organizationId = randomUUID();
    const storeId = randomUUID();
    const token = 'secret-token-never-persist-plain';
    const envelope = new ShopifyCredentialCipher(new EnvironmentService()).encrypt(
      token,
      organizationId,
      storeId,
    );
    restoreV1();
    expect(JSON.stringify(envelope)).not.toContain(token);

    const restoreV2 = setEnvironment({
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1, v2 }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v2',
    });
    const rotatedCipher = new ShopifyCredentialCipher(new EnvironmentService());
    expect(rotatedCipher.decrypt(envelope, organizationId, storeId)).toBe(token);
    expect(rotatedCipher.encrypt('new-secret-token-value', organizationId, storeId).version).toBe(
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
      SHOPIFY_INTEGRATIONS_ENABLED: controls.enabled,
      SHOPIFY_INTEGRATIONS_KILL_SWITCH: controls.killSwitch,
      SHOPIFY_SIMULATION_MODE: controls.simulation,
    });
    try {
      const service = new ShopifyIntegrationService(
        {} as AuditService,
        {} as ShopifyCredentialCipher,
        new EnvironmentService(),
        {} as MetricsService,
        {} as PrismaService,
        {} as RequestContextService,
        new ShopifyMockProvider(),
      );
      await expect(
        service.register({
          accessToken: 'mock-valid-token-value',
          currency: 'COP',
          displayName: 'Simulated store',
          idempotencyKey: 'closed-operation-key',
          name: 'Safe store',
          organizationId: principal.organizationId,
          principal,
          shopDomain: 'safe.myshopify.com',
          timezone: 'America/Bogota',
        }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      restore();
    }
  });
});
