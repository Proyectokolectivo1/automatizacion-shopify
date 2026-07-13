import { describe, expect, it } from 'vitest';

import { requestHash } from '../src/foundation/request-hash';

describe('requestHash', () => {
  it('is stable when object keys have a different order', () => {
    expect(requestHash({ currency: 'COP', name: 'Acme' })).toBe(
      requestHash({ name: 'Acme', currency: 'COP' }),
    );
  });

  it('changes when a semantic value changes', () => {
    expect(requestHash({ currency: 'COP' })).not.toBe(requestHash({ currency: 'USD' }));
  });
});
