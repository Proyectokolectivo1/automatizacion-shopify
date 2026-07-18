import { describe, expect, it } from 'vitest';

import fixture from '../src/payments/fixtures/wompi-event.v1.json';
import {
  createWompiEventChecksum,
  verifyWompiEventChecksum,
} from '../src/payments/wompi-event-signature';

describe('Wompi event checksum contract', () => {
  const input = {
    data: {
      transaction: {
        amount_in_cents: 1_200_000,
        id: 'sim_transaction_1',
        status: 'APPROVED',
      },
    },
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    timestamp: 1_784_078_400_000,
  };

  it('concatenates signature properties in provider order plus timestamp and event secret', () => {
    const checksum = createWompiEventChecksum(input, fixture.eventSecret);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(verifyWompiEventChecksum(input, checksum, fixture.eventSecret)).toBe(true);
  });

  it('fails closed for changed values, missing properties and malformed checksums', () => {
    const checksum = createWompiEventChecksum(input, fixture.eventSecret);
    expect(
      verifyWompiEventChecksum(
        { ...input, data: { transaction: { ...input.data.transaction, status: 'DECLINED' } } },
        checksum,
        fixture.eventSecret,
      ),
    ).toBe(false);
    expect(
      verifyWompiEventChecksum(
        { ...input, properties: ['transaction.missing'] },
        checksum,
        fixture.eventSecret,
      ),
    ).toBe(false);
    expect(verifyWompiEventChecksum(input, 'invalid', fixture.eventSecret)).toBe(false);
  });
});
