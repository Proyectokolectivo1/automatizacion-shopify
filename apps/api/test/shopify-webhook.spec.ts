import { randomBytes, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EnvironmentService } from '../src/config/environment.service';
import { ShopifyCredentialCipher } from '../src/shopify/shopify-credential-cipher';
import {
  createShopifyWebhookHmac,
  verifyShopifyWebhookHmac,
} from '../src/shopify/shopify-webhook-signature';

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

describe('Shopify webhook cryptographic boundary', () => {
  it('authenticates the exact raw bytes and rejects altered or malformed signatures', () => {
    const secret = 'simulated-webhook-secret-with-adequate-length';
    const rawBody = Buffer.from('{"id":1,"test":true}', 'utf8');
    const signature = createShopifyWebhookHmac(rawBody, secret);
    expect(verifyShopifyWebhookHmac(rawBody, signature, secret)).toBe(true);
    expect(
      verifyShopifyWebhookHmac(Buffer.from('{"test":true,"id":1}', 'utf8'), signature, secret),
    ).toBe(false);
    expect(verifyShopifyWebhookHmac(rawBody, 'not-a-valid-digest', secret)).toBe(false);
  });

  it('separates webhook-secret AAD from access-token AAD', () => {
    const names = Object.keys(environmentBase).concat(
      'SHOPIFY_CREDENTIAL_KEYS_JSON',
      'SHOPIFY_CREDENTIAL_KEY_VERSION',
    );
    const previous = new Map(names.map((name) => [name, process.env[name]] as const));
    Object.assign(process.env, environmentBase, {
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({
        v1: randomBytes(32).toString('base64url'),
      }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v1',
    });
    try {
      const cipher = new ShopifyCredentialCipher(new EnvironmentService());
      const organizationId = randomUUID();
      const storeId = randomUUID();
      const secret = 'webhook-secret-never-written-in-plaintext';
      const envelope = cipher.encryptWebhookSecret(secret, organizationId, storeId);
      expect(cipher.decryptWebhookSecret(envelope, organizationId, storeId)).toBe(secret);
      expect(() => cipher.decrypt(envelope, organizationId, storeId)).toThrow(/decryption failed/u);
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('accepts the previous webhook secret only during the configured overlap', () => {
    const names = Object.keys(environmentBase).concat(
      'SHOPIFY_CREDENTIAL_KEYS_JSON',
      'SHOPIFY_CREDENTIAL_KEY_VERSION',
    );
    const previousEnvironment = new Map(names.map((name) => [name, process.env[name]] as const));
    Object.assign(process.env, environmentBase, {
      SHOPIFY_CREDENTIAL_KEYS_JSON: JSON.stringify({
        v1: randomBytes(32).toString('base64url'),
      }),
      SHOPIFY_CREDENTIAL_KEY_VERSION: 'v1',
    });
    try {
      const cipher = new ShopifyCredentialCipher(new EnvironmentService());
      const organizationId = randomUUID();
      const storeId = randomUUID();
      const oldSecret = 'old-webhook-secret-with-adequate-length';
      const newSecret = 'new-webhook-secret-with-adequate-length';
      const oldEnvelope = cipher.encryptWebhookSecret(oldSecret, organizationId, storeId);
      const rotated = cipher.rotateWebhookSecret(
        newSecret,
        oldEnvelope,
        organizationId,
        storeId,
        new Date('2026-07-19T00:00:00Z'),
      );
      expect(
        cipher.decryptWebhookSecrets(
          rotated,
          organizationId,
          storeId,
          new Date('2026-07-18T00:00:00Z'),
        ),
      ).toEqual([newSecret, oldSecret]);
      expect(
        cipher.decryptWebhookSecrets(
          rotated,
          organizationId,
          storeId,
          new Date('2026-07-20T00:00:00Z'),
        ),
      ).toEqual([newSecret]);
    } finally {
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
