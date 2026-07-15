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

export interface WhatsAppCredentialEnvelope {
  readonly authTag: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly version: string;
}

@Injectable()
export class WhatsAppCredentialCipher {
  public constructor(private readonly environment: EnvironmentService) {}

  public encrypt(
    accessToken: string,
    organizationId: string,
    storeId: string,
  ): WhatsAppCredentialEnvelope {
    const { key, version } = this.currentKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(organizationId, storeId));
    const ciphertext = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      iv: iv.toString('base64url'),
      version,
    };
  }

  public decrypt(value: unknown, organizationId: string, storeId: string): string {
    const envelope = envelopeSchema.safeParse(value);
    if (!envelope.success) throw new ServiceUnavailableException('Invalid credential envelope');
    const key = this.keyring().get(envelope.data.version);
    if (key === undefined) {
      throw new ServiceUnavailableException('WhatsApp credential key version is unavailable');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.data.iv, 'base64url'),
      );
      decipher.setAAD(this.aad(organizationId, storeId));
      decipher.setAuthTag(Buffer.from(envelope.data.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.data.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Credential decryption failed');
    }
  }

  private aad(organizationId: string, storeId: string): Buffer {
    return Buffer.from(`whatsapp:${organizationId}:${storeId}:access-token`, 'utf8');
  }

  private currentKey(): { key: Buffer; version: string } {
    const version = this.environment.whatsapp.credentialKeyVersion;
    if (version === undefined) {
      throw new ServiceUnavailableException('WhatsApp credential key is not configured');
    }
    const key = this.keyring().get(version);
    if (key === undefined) {
      throw new ServiceUnavailableException('WhatsApp credential key version is unavailable');
    }
    return { key, version };
  }

  private keyring(): ReadonlyMap<string, Buffer> {
    const raw = this.environment.whatsapp.credentialKeysJson;
    if (raw === undefined) {
      throw new ServiceUnavailableException('WhatsApp credential keyring is not configured');
    }
    try {
      const parsed = z
        .record(z.string().regex(/^v[1-9][0-9]*$/u), z.string().min(1))
        .parse(JSON.parse(raw));
      return new Map(
        Object.entries(parsed).map(([version, encoded]) => {
          const key = Buffer.from(encoded, 'base64url');
          if (key.length !== 32) throw new Error('invalid key length');
          return [version, key] as const;
        }),
      );
    } catch {
      throw new ServiceUnavailableException('WhatsApp credential keyring is invalid');
    }
  }
}
