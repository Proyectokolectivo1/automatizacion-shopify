import { describe, expect, it } from 'vitest';

import {
  TransportRateResolutionError,
  TransportRateResolver,
  type TransportRatePolicyCandidate,
} from '../src/rates/transport-rate-resolver';

const now = new Date('2026-07-14T12:00:00.000Z');
const rule = (
  overrides: Partial<TransportRatePolicyCandidate['rules'][number]> = {},
): TransportRatePolicyCandidate['rules'][number] => ({
  amount: 1_500_000n,
  city: null,
  department: null,
  id: 'rule-default',
  priority: 10,
  ruleKey: 'default',
  shopifyProductId: null,
  validFrom: null,
  validTo: null,
  ...overrides,
});
const policy = (
  overrides: Partial<TransportRatePolicyCandidate> = {},
): TransportRatePolicyCandidate => ({
  currency: 'COP',
  id: 'policy-global',
  rules: [rule()],
  scope: 'global',
  version: 1,
  ...overrides,
});
const input = (policies: readonly TransportRatePolicyCandidate[]) => ({
  city: ' Bogotá ',
  currency: 'COP',
  department: 'Cundinamarca',
  evaluatedAt: now,
  policies,
  shopifyProductIds: ['product-1'],
});

describe('TransportRateResolver', () => {
  const resolver = new TransportRateResolver();

  it('uses priority before specificity and normalizes locations', () => {
    const result = resolver.resolve(
      input([
        policy({
          rules: [
            rule({ amount: 2_000_000n, city: 'bogotá', id: 'specific', ruleKey: 'specific' }),
            rule({ amount: 1_000_000n, id: 'priority', priority: 20, ruleKey: 'priority' }),
          ],
        }),
      ]),
    );
    expect(result).toMatchObject({ amount: 1_000_000n, ruleKey: 'priority' });
  });

  it('uses specificity and then store scope to break equal priorities', () => {
    const specific = resolver.resolve(
      input([
        policy({ rules: [rule({ id: 'global', ruleKey: 'global' })] }),
        policy({
          id: 'policy-store',
          rules: [rule({ city: 'Bogotá', id: 'city', ruleKey: 'city' })],
          scope: 'store',
        }),
      ]),
    );
    expect(specific).toMatchObject({ policyScope: 'store', ruleKey: 'city' });
  });

  it('matches any product in the order and respects semi-open validity', () => {
    const result = resolver.resolve(
      input([
        policy({
          rules: [
            rule({
              id: 'product',
              ruleKey: 'product',
              shopifyProductId: 'product-1',
              validFrom: now,
              validTo: new Date('2026-07-15T00:00:00.000Z'),
            }),
          ],
        }),
      ]),
    );
    expect(result.ruleKey).toBe('product');
  });

  it('fails closed when equal-ranked rules disagree', () => {
    expect(() =>
      resolver.resolve(
        input([
          policy({
            rules: [
              rule({ amount: 1n, id: 'a', ruleKey: 'a' }),
              rule({ amount: 2n, id: 'b', ruleKey: 'b' }),
            ],
          }),
        ]),
      ),
    ).toThrowError(TransportRateResolutionError);
  });

  it('fails closed without a match or for a non-COP input', () => {
    expect(() =>
      resolver.resolve(input([policy({ rules: [rule({ city: 'Cali' })] })])),
    ).toThrowError(/No active/u);
    expect(() => resolver.resolve({ ...input([policy()]), currency: 'USD' })).toThrowError(
      /unsupported/u,
    );
  });
});
