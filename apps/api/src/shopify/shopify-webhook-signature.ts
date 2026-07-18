import { createHmac, timingSafeEqual } from 'node:crypto';

export function createShopifyWebhookHmac(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}

export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  suppliedHmac: string,
  secret: string,
): boolean {
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedHmac, 'base64');
  } catch {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
