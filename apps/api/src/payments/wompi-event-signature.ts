import { createHash, timingSafeEqual } from 'node:crypto';

export interface WompiSignatureInput {
  readonly data: Record<string, unknown>;
  readonly properties: readonly string[];
  readonly timestamp: number;
}

export function createWompiEventChecksum(input: WompiSignatureInput, secret: string): string {
  const values = input.properties.map((property) => readProperty(input.data, property));
  return createHash('sha256')
    .update(`${values.join('')}${input.timestamp}${secret}`)
    .digest('hex');
}

export function verifyWompiEventChecksum(
  input: WompiSignatureInput,
  checksum: string,
  secret: string,
): boolean {
  if (!/^[a-f0-9]{64}$/u.test(checksum)) return false;
  let expected: string;
  try {
    expected = createWompiEventChecksum(input, secret);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(checksum, 'hex'));
}

function readProperty(data: Record<string, unknown>, property: string): string {
  const segments = property.split('.');
  let current: unknown = data;
  for (const segment of segments) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      throw new Error(`Missing signed Wompi property: ${property}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (typeof current !== 'string' && typeof current !== 'number') {
    throw new Error(`Invalid signed Wompi property: ${property}`);
  }
  return String(current);
}
