import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { EnvironmentService } from '../config/environment.service';

const envelopeSchema = z.object({
  authTag: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  version: z.string().regex(/^v[1-9][0-9]*$/u),
});

export interface CredentialEnvelope {
  readonly authTag: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly version: string;
}

@Injectable()
export class ShopifyCredentialCipher {
  public constructor(private readonly environment: EnvironmentService) {}

  public encrypt(accessToken: string, organizationId: string, storeId: string): CredentialEnvelope {
    return this.encryptValue(accessToken, organizationId, storeId, 'access-token');
  }

  public encryptWebhookSecret(
    webhookSecret: string,
    organizationId: string,
    storeId: string,
  ): CredentialEnvelope {
    return this.encryptValue(webhookSecret, organizationId, storeId, 'webhook-secret');
  }

  public decrypt(value: unknown, organizationId: string, storeId: string): string {
    return this.decryptValue(value, organizationId, storeId, 'access-token');
  }

  public decryptWebhookSecret(value: unknown, organizationId: string, storeId: string): string {
    return this.decryptValue(value, organizationId, storeId, 'webhook-secret');
  }

  private encryptValue(
    plaintext: string,
    organizationId: string,
    storeId: string,
    purpose: 'access-token' | 'webhook-secret',
  ): CredentialEnvelope {
    const { key, version } = this.currentKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(organizationId, storeId, purpose));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      iv: iv.toString('base64url'),
      version,
    };
  }

  private decryptValue(
    value: unknown,
    organizationId: string,
    storeId: string,
    purpose: 'access-token' | 'webhook-secret',
  ): string {
    const envelope = envelopeSchema.safeParse(value);
    if (!envelope.success) throw new ServiceUnavailableException('Invalid credential envelope');
    const key = this.keyring().get(envelope.data.version);
    if (key === undefined) {
      throw new ServiceUnavailableException('Credential key version is unavailable');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.data.iv, 'base64url'),
      );
      decipher.setAAD(this.aad(organizationId, storeId, purpose));
      decipher.setAuthTag(Buffer.from(envelope.data.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.data.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Credential decryption failed');
    }
  }

  private aad(
    organizationId: string,
    storeId: string,
    purpose: 'access-token' | 'webhook-secret',
  ): Buffer {
    return Buffer.from(`shopify:${organizationId}:${storeId}:${purpose}`, 'utf8');
  }

  private currentKey(): { key: Buffer; version: string } {
    const version = this.environment.shopify.credentialKeyVersion;
    if (version === undefined) {
      throw new ServiceUnavailableException('Shopify credential key is not configured');
    }
    const key = this.keyring().get(version);
    if (key === undefined) {
      throw new ServiceUnavailableException('Shopify credential key version is unavailable');
    }
    return { key, version };
  }

  private keyring(): ReadonlyMap<string, Buffer> {
    const raw = this.environment.shopify.credentialKeysJson;
    if (raw === undefined) {
      throw new ServiceUnavailableException('Shopify credential keyring is not configured');
    }
    try {
      const parsed = z
        .record(z.string().regex(/^v[1-9][0-9]*$/u), z.string().min(1))
        .parse(JSON.parse(raw));
      const entries = Object.entries(parsed).map(([version, encoded]) => {
        const key = Buffer.from(encoded, 'base64url');
        if (key.length !== 32) throw new Error('invalid key length');
        return [version, key] as const;
      });
      return new Map(entries);
    } catch {
      throw new ServiceUnavailableException('Shopify credential keyring is invalid');
    }
  }
}
