import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnvironmentService } from '../src/config/environment.service';
import type { DependencyStatus } from '../src/foundation/dependency-status';
import type { AppLoggerService } from '../src/observability/app-logger.service';
import { AlertingService } from '../src/observability/alerting.service';
import type { MetricsService } from '../src/observability/metrics.service';
import type { TracingService } from '../src/observability/tracing.service';

const dependency = (status: 'down' | 'up'): DependencyStatus => ({
  latencyMs: 1,
  name: 'redis',
  status,
});

const activeRedisAlert = (startsAt = '2026-07-18T10:00:00.000Z') => ({
  labels: {
    alertname: 'EcommerceDependencyUnavailable',
    dependency: 'redis',
    service: 'api',
  },
  startsAt,
  status: { state: 'active' },
});

const createSubject = () => {
  const environment = {
    observabilityAlerts: {
      alertmanagerUrl: 'http://127.0.0.1:9093/api/v2/alerts',
      enabled: true,
      killSwitch: false,
      timeoutMs: 1_000,
    },
  } as EnvironmentService;
  const logFailure = vi.fn();
  const logger = { event: vi.fn(), failure: logFailure } as unknown as AppLoggerService;
  const recordAlert = vi.fn();
  const metrics = { recordObservabilityAlert: recordAlert } as unknown as MetricsService;
  const tracing = { inject: vi.fn() } as unknown as TracingService;
  return {
    logFailure,
    recordAlert,
    service: new AlertingService(environment, logger, metrics, tracing),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AlertingService restart hydration', () => {
  it('resolves an active Alertmanager alert when the dependency recovered during restart', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([activeRedisAlert()])))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { recordAlert, service } = createSubject();

    await service.observeDependencies([dependency('up')]);
    await service.observeDependencies([dependency('up')]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const hydrationInput = fetchMock.mock.calls[0]?.[0];
    if (!(hydrationInput instanceof URL)) throw new Error('Expected hydration URL');
    const hydrationUrl = hydrationInput;
    expect(hydrationUrl.pathname).toBe('/api/v2/alerts');
    expect(hydrationUrl.searchParams.get('active')).toBe('true');
    const deliveredBody = fetchMock.mock.calls[1]?.[1]?.body;
    if (typeof deliveredBody !== 'string') throw new Error('Expected string alert body');
    const parsed: unknown = JSON.parse(deliveredBody);
    if (!Array.isArray(parsed)) throw new Error('Expected alert array');
    const delivered = parsed as readonly {
      endsAt?: string;
      startsAt: string;
    }[];
    expect(delivered[0]?.startsAt).toBe('2026-07-18T10:00:00.000Z');
    expect(typeof delivered[0]?.endsAt).toBe('string');
    expect(recordAlert).toHaveBeenCalledWith('resolved', 'success');
  });

  it('adopts an active alert without delivering a duplicate firing notification', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify([activeRedisAlert()])));
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createSubject();

    await service.observeDependencies([dependency('down')]);
    await service.observeDependencies([dependency('down')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed on an invalid contract and retries hydration before firing', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{invalid-json'))
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { logFailure, recordAlert, service } = createSubject();

    await service.observeDependencies([dependency('down')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await service.observeDependencies([dependency('down')]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logFailure).toHaveBeenCalledWith(
      expect.anything(),
      {},
      'dependency_alert_state_hydration_failed',
    );
    expect(recordAlert).toHaveBeenCalledWith('firing', 'success');
  });

  it('ignores alerts outside the exact owned label set', async () => {
    const foreign = activeRedisAlert();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ ...foreign, labels: { ...foreign.labels, service: 'another-api' } }]),
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createSubject();

    await service.observeDependencies([dependency('down')]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('rejects an unbounded Alertmanager response without setting baseline', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(Array.from({ length: 1_001 }, () => ({})))));
    vi.stubGlobal('fetch', fetchMock);
    const { logFailure, service } = createSubject();

    await service.observeDependencies([dependency('up')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logFailure).toHaveBeenCalledOnce();
  });

  it('shares one hydration request across concurrent readiness observations', async () => {
    let resolveHydration: ((response: Response) => void) | undefined;
    const hydration = new Promise<Response>((resolve) => {
      resolveHydration = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(hydration);
    vi.stubGlobal('fetch', fetchMock);
    const { service } = createSubject();

    const observations = [
      service.observeDependencies([dependency('up')]),
      service.observeDependencies([dependency('up')]),
    ];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveHydration?.(new Response('[]'));
    await Promise.all(observations);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
