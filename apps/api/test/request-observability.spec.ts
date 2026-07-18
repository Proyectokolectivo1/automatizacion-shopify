import { describe, expect, it } from 'vitest';

import { resolveCorrelationId } from '../src/observability/correlation-id';
import { canAccessMetrics } from '../src/observability/metrics-access';

describe('resolveCorrelationId', () => {
  it('preserves a safe caller correlation ID', () => {
    expect(resolveCorrelationId('order-flow:01HZX_abc')).toBe('order-flow:01HZX_abc');
  });

  it('replaces unsafe or missing values with UUIDs', () => {
    expect(resolveCorrelationId('unsafe value')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(resolveCorrelationId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});

describe('canAccessMetrics', () => {
  it('accepts loopback network access and rejects remote or disabled access', () => {
    expect(
      canAccessMetrics({
        authorization: undefined,
        bearerToken: undefined,
        mode: 'loopback',
        remoteAddress: '::ffff:127.0.0.1',
      }),
    ).toBe(true);
    expect(
      canAccessMetrics({
        authorization: undefined,
        bearerToken: undefined,
        mode: 'loopback',
        remoteAddress: '10.0.0.2',
      }),
    ).toBe(false);
    expect(
      canAccessMetrics({
        authorization: undefined,
        bearerToken: undefined,
        mode: 'disabled',
        remoteAddress: '127.0.0.1',
      }),
    ).toBe(false);
  });

  it('compares bearer credentials without accepting malformed headers', () => {
    const bearerToken = 'metrics-token-that-is-long-enough';
    expect(
      canAccessMetrics({
        authorization: `Bearer ${bearerToken}`,
        bearerToken,
        mode: 'bearer',
        remoteAddress: '10.0.0.2',
      }),
    ).toBe(true);
    for (const authorization of [undefined, bearerToken, 'Bearer wrong-token']) {
      expect(
        canAccessMetrics({
          authorization,
          bearerToken,
          mode: 'bearer',
          remoteAddress: '127.0.0.1',
        }),
      ).toBe(false);
    }
  });
});
