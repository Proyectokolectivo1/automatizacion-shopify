import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

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

export interface WhatsAppInboundPseudonyms {
  readonly candidates: readonly string[];
  readonly current: string;
}

type WhatsAppCipherPurpose =
  'access-token' | 'webhook-secret' | `inbound-message-content:${string}`;

@Injectable()
export class WhatsAppCredentialCipher {
  public constructor(private readonly environment: EnvironmentService) {}

  public encrypt(
    accessToken: string,
    organizationId: string,
    storeId: string,
  ): WhatsAppCredentialEnvelope {
    return this.encryptForPurpose(accessToken, organizationId, storeId, 'access-token');
  }

  public encryptWebhookSecret(
    webhookSecret: string,
    organizationId: string,
    storeId: string,
  ): WhatsAppCredentialEnvelope {
    return this.encryptForPurpose(webhookSecret, organizationId, storeId, 'webhook-secret');
  }

  public decrypt(value: unknown, organizationId: string, storeId: string): string {
    return this.decryptForPurpose(value, organizationId, storeId, 'access-token');
  }

  public decryptWebhookSecret(value: unknown, organizationId: string, storeId: string): string {
    return this.decryptForPurpose(value, organizationId, storeId, 'webhook-secret');
  }

  public encryptInboundMessageContent(
    content: string,
    organizationId: string,
    storeId: string,
    messageId: string,
  ): WhatsAppCredentialEnvelope {
    return this.encryptForPurpose(
      content,
      organizationId,
      storeId,
      `inbound-message-content:${messageId}`,
    );
  }

  public decryptInboundMessageContent(
    value: unknown,
    organizationId: string,
    storeId: string,
    messageId: string,
  ): string {
    return this.decryptForPurpose(
      value,
      organizationId,
      storeId,
      `inbound-message-content:${messageId}`,
    );
  }

  public pseudonymizeInboundSender(
    senderPhoneE164: string,
    organizationId: string,
    storeId: string,
  ): WhatsAppInboundPseudonyms {
    const { key: currentKey, version: currentVersion } = this.currentKey();
    const keyring = this.keyring();
    const current = this.keyedDigest(
      currentKey,
      senderPhoneE164,
      organizationId,
      storeId,
      'inbound-sender',
    );
    const candidates = [
      current,
      ...[...keyring.entries()]
        .filter(([version]) => version !== currentVersion)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, key]) =>
          this.keyedDigest(key, senderPhoneE164, organizationId, storeId, 'inbound-sender'),
        ),
    ];
    return { candidates: [...new Set(candidates)], current };
  }

  public fingerprintInboundContent(
    content: string,
    organizationId: string,
    storeId: string,
  ): string {
    return this.keyedDigest(
      this.currentKey().key,
      content,
      organizationId,
      storeId,
      'inbound-content',
    );
  }

  private encryptForPurpose(
    value: string,
    organizationId: string,
    storeId: string,
    purpose: WhatsAppCipherPurpose,
  ): WhatsAppCredentialEnvelope {
    const { key, version } = this.currentKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.aad(organizationId, storeId, purpose));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      authTag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      iv: iv.toString('base64url'),
      version,
    };
  }

  private decryptForPurpose(
    value: unknown,
    organizationId: string,
    storeId: string,
    purpose: WhatsAppCipherPurpose,
  ): string {
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

  private aad(organizationId: string, storeId: string, purpose: WhatsAppCipherPurpose): Buffer {
    return Buffer.from(`whatsapp:${organizationId}:${storeId}:${purpose}`, 'utf8');
  }

  private keyedDigest(
    key: Buffer,
    value: string,
    organizationId: string,
    storeId: string,
    namespace: 'inbound-content' | 'inbound-sender',
  ): string {
    return createHmac('sha256', key)
      .update(`whatsapp:${organizationId}:${storeId}:${namespace}:`, 'utf8')
      .update(value, 'utf8')
      .digest('hex');
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
