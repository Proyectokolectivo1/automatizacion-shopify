import { createHash, timingSafeEqual } from 'node:crypto';

export type MetricsAccessMode = 'bearer' | 'disabled' | 'loopback';

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.')
  );
}

function validBearerToken(
  authorization: string | undefined,
  expected: string | undefined,
): boolean {
  if (authorization === undefined || expected === undefined) return false;
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (match?.[1] === undefined) return false;
  const actualHash = createHash('sha256').update(match[1]).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function canAccessMetrics(
  input: Readonly<{
    authorization: string | undefined;
    bearerToken: string | undefined;
    mode: MetricsAccessMode;
    remoteAddress: string | undefined;
  }>,
): boolean {
  if (input.mode === 'disabled') return false;
  if (input.mode === 'loopback') return isLoopbackAddress(input.remoteAddress);
  return validBearerToken(input.authorization, input.bearerToken);
}
