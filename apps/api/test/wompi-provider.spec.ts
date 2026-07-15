import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WompiMockProvider } from '../src/payments/wompi-mock.provider';

describe('synthetic Wompi hosted checkout contract', () => {
  const provider = new WompiMockProvider();

  it('constructs the official parameters and integrity order on a non-routable host', async () => {
    const expiresAt = new Date('2026-07-15T12:00:00.000Z');
    const result = await provider.createHostedCheckout({
      amountMinor: 1_200_000,
      currency: 'COP',
      expiresAt,
      reference: 'cod-order-1',
    });
    const checkout = new URL(result.checkoutUrl);
    expect(checkout.hostname).toBe('checkout.wompi.simulated.invalid');
    expect(checkout.pathname).toBe('/p/');
    expect(checkout.searchParams.get('public-key')).toBe('pub_test_synthetic_codex_not_a_real_key');
    expect(checkout.searchParams.get('currency')).toBe('COP');
    expect(checkout.searchParams.get('amount-in-cents')).toBe('1200000');
    expect(checkout.searchParams.get('reference')).toBe('cod-order-1');
    expect(checkout.searchParams.get('expiration-time')).toBe(expiresAt.toISOString());
    expect(checkout.searchParams.get('signature:integrity')).toBe(
      createHash('sha256')
        .update(
          'cod-order-1' +
            '1200000' +
            'COP' +
            expiresAt.toISOString() +
            'test_integrity_synthetic_codex_not_a_real_secret',
        )
        .digest('hex'),
    );
    expect(result).toMatchObject({ fixtureVersion: 'v1', mode: 'simulation' });
    await expect(provider.getTransaction(result.providerCheckoutId)).resolves.toMatchObject({
      amountMinor: 1_200_000,
      currency: 'COP',
      reference: 'cod-order-1',
      status: 'PENDING',
    });
  });

  it('fails closed for unsupported currency, amount or reference', async () => {
    await expect(
      provider.createHostedCheckout({
        amountMinor: 0,
        currency: 'COP',
        expiresAt: new Date('2026-07-15T12:00:00.000Z'),
        reference: 'invalid reference',
      }),
    ).rejects.toThrow('Invalid synthetic Wompi checkout command');
  });
});
