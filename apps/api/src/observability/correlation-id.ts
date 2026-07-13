import { randomUUID } from 'node:crypto';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveCorrelationId(header: unknown): string {
  return typeof header === 'string' && SAFE_CORRELATION_ID.test(header) ? header : randomUUID();
}
