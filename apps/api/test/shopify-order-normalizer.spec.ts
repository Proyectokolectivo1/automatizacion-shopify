import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ShopifyOrderNormalizer } from '../src/shopify/shopify-order-normalizer';

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/shopify/fixtures/shopify-orders-create.v1.json'),
    'utf8',
  ),
) as Record<string, unknown>;

describe('ShopifyOrderNormalizer', () => {
  const normalizer = new ShopifyOrderNormalizer();

  it('normalizes identifiers, address and money without floating point', () => {
    const order = normalizer.normalize(fixture);
    expect(order).toMatchObject({
      checkoutId: '1100000000001',
      currency: 'COP',
      discountAmount: 0n,
      id: '1000000000001',
      name: '#SIM-1001',
      subtotalAmount: 1_000_000n,
      taxAmount: 0n,
      totalAmount: 1_000_000n,
      transportChargeAmount: 0n,
    });
    expect(order.customer).toMatchObject({
      email: 'cliente.sintetico@example.test',
      phoneE164: '+573001112233',
    });
    expect(order.address.normalizedAddress).toContain('Bogota');
    expect(order.items[0]).toMatchObject({
      quantity: 1,
      totalPriceAmount: 1_000_000n,
      unitPriceAmount: 1_000_000n,
    });
  });

  it('rejects non-synthetic, inconsistent and temporally invalid payloads', () => {
    expect(() => normalizer.normalize({ ...fixture, test: false })).toThrow();
    expect(() => normalizer.normalize({ ...fixture, total_price: '999.00' })).toThrow(
      'totals are inconsistent',
    );
    expect(() =>
      normalizer.normalize({ ...fixture, updated_at: '2026-07-13T12:00:00-05:00' }),
    ).toThrow('updated_at precedes created_at');
  });

  it('rejects invalid identifiers, PII formats and unbounded line collections', () => {
    expect(() => normalizer.normalize({ ...fixture, id: '' })).toThrow();
    expect(() =>
      normalizer.normalize({
        ...fixture,
        customer: { ...(fixture.customer as object), phone: '3001112233' },
      }),
    ).toThrow();
    expect(() => normalizer.normalize({ ...fixture, line_items: [] })).toThrow();
  });
});
