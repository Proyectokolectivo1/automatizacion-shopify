import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { OPERATIONAL_TYPES, type OperationalType } from '../contracts';
import { BffError } from './bff';

const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('ecommerce-inteligente:operational-detail:v1', 'utf8');
const REFERENCE_TTL_MS = 15 * 60 * 1000;
const developmentKey = randomBytes(32);
const payloadSchema = z
  .object({
    expiresAt: z.number().int().positive(),
    itemId: z.string().uuid(),
    organizationId: z.string().uuid(),
    type: z.enum(OPERATIONAL_TYPES),
  })
  .strict();

export interface DetailReferencePayload {
  readonly itemId: string;
  readonly organizationId: string;
  readonly type: OperationalType;
}

function referenceKey(): Buffer {
  const raw = process.env.WEB_DETAIL_REFERENCE_KEY?.trim();
  if (raw === undefined || raw === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new BffError(503, 'Configuración de detalle no disponible');
    }
    return developmentKey;
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(raw)) {
    throw new BffError(503, 'Configuración de detalle no disponible');
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.length !== 32) throw new BffError(503, 'Configuración de detalle no disponible');
  return key;
}

export function createDetailReference(payload: DetailReferencePayload, now = Date.now()): string {
  const validated = payloadSchema.omit({ expiresAt: true }).parse(payload);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, referenceKey(), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ ...validated, expiresAt: now + REFERENCE_TTL_MS }), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function readDetailReference(
  value: string,
  expectedOrganizationId: string,
  now = Date.now(),
): DetailReferencePayload {
  try {
    const [version, ivValue, encryptedValue, tagValue, extra] = value.split('.');
    if (
      version !== 'v1' ||
      ivValue === undefined ||
      encryptedValue === undefined ||
      tagValue === undefined ||
      extra !== undefined
    ) {
      throw new Error('Invalid reference shape');
    }
    const iv = Buffer.from(ivValue, 'base64url');
    const encrypted = Buffer.from(encryptedValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    if (iv.length !== 12 || encrypted.length === 0 || encrypted.length > 512 || tag.length !== 16) {
      throw new Error('Invalid reference bounds');
    }
    const decipher = createDecipheriv(ALGORITHM, referenceKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const parsed = payloadSchema.parse(
      JSON.parse(
        Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'),
      ) as unknown,
    );
    if (
      parsed.organizationId !== expectedOrganizationId ||
      parsed.expiresAt <= now ||
      parsed.expiresAt > now + REFERENCE_TTL_MS
    ) {
      throw new Error('Reference is expired or belongs to another tenant');
    }
    return {
      itemId: parsed.itemId,
      organizationId: parsed.organizationId,
      type: parsed.type,
    };
  } catch (error) {
    if (error instanceof BffError) throw error;
    throw new BffError(400, 'Referencia de detalle inválida o expirada');
  }
}
