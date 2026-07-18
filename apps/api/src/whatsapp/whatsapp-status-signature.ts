import { createHmac, timingSafeEqual } from 'node:crypto';

const signaturePattern = /^sha256=([0-9a-f]{64})$/u;

export function verifySimulatedWhatsAppStatusSignature(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string,
): boolean {
  const match = signaturePattern.exec(signature);
  if (match?.[1] === undefined) return false;
  const received = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}
