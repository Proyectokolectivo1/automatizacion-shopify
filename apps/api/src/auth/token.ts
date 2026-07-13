import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PATTERN =
  /^(?<sessionId>[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?<secret>[A-Za-z0-9_-]{43})$/u;

export interface ParsedToken {
  readonly secretHash: string;
  readonly sessionId: string;
}

export function hashSensitive(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function issueOpaqueToken(sessionId: string): { hash: string; token: string } {
  const secret = randomBytes(32).toString('base64url');
  return { hash: hashSensitive(secret), token: `${sessionId}.${secret}` };
}

export function parseOpaqueToken(token: string): ParsedToken | undefined {
  const match = TOKEN_PATTERN.exec(token);
  if (match?.groups === undefined) return undefined;
  const { secret, sessionId } = match.groups;
  if (secret === undefined || sessionId === undefined) return undefined;
  return { secretHash: hashSensitive(secret), sessionId };
}

export function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
