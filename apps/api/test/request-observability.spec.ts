import { describe, expect, it } from 'vitest';

import { resolveCorrelationId } from '../src/observability/correlation-id';

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
