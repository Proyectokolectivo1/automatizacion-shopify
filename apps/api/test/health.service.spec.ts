import { describe, expect, it, vi } from 'vitest';

import { HealthService } from '../src/health/health.service';

describe('HealthService', () => {
  it('reports a timestamped healthy API', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T20:00:00.000Z'));

    expect(new HealthService().getStatus()).toEqual({
      service: 'api',
      status: 'ok',
      timestamp: '2026-07-12T20:00:00.000Z',
    });

    vi.useRealTimers();
  });
});
