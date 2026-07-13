import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PasswordService } from '../src/auth/password.service';
import { issueOpaqueToken, parseOpaqueToken, safeHashEquals } from '../src/auth/token';

describe('authentication cryptography', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const service = new PasswordService();
    const passwordHash = await service.hash('Strong-password-123');
    expect(passwordHash).toContain('$argon2id$');
    await expect(service.verify(passwordHash, 'Strong-password-123')).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'Wrong-password-123')).resolves.toBe(false);
  });

  it('performs a dummy verification for an unknown account', async () => {
    await expect(new PasswordService().verify(undefined, 'Unknown-password-123')).resolves.toBe(
      false,
    );
  });

  it('issues parseable opaque tokens without embedding identity data', () => {
    const sessionId = randomUUID();
    const issued = issueOpaqueToken(sessionId);
    const parsed = parseOpaqueToken(issued.token);
    expect(parsed).toEqual({ secretHash: issued.hash, sessionId });
    expect(issued.token).not.toContain('@');
  });

  it('rejects malformed tokens and compares hashes safely', () => {
    expect(parseOpaqueToken('invalid')).toBeUndefined();
    expect(safeHashEquals('00'.repeat(32), '00'.repeat(32))).toBe(true);
    expect(safeHashEquals('00'.repeat(32), '11'.repeat(32))).toBe(false);
  });
});
