import { Injectable } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { type DependencyStatus } from '../foundation/dependency-status';
import { AppLoggerService } from './app-logger.service';
import { MetricsService } from './metrics.service';
import { TracingService } from './tracing.service';

interface AlertState {
  readonly startedAt: string | undefined;
  readonly status: DependencyStatus['status'];
}

interface ActiveAlert {
  readonly dependency: DependencyStatus['name'];
  readonly startsAt: string;
}

const ALERT_NAME = 'EcommerceDependencyUnavailable';
const ALERT_SERVICE = 'api';
const MAX_ALERTMANAGER_RESPONSE_BYTES = 1_048_576;
const MAX_ALERTMANAGER_ALERTS = 1_000;

@Injectable()
export class AlertingService {
  private hydrated = false;
  private hydration: Promise<boolean> | undefined;
  private readonly states = new Map<DependencyStatus['name'], AlertState>();

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly logger: AppLoggerService,
    private readonly metrics: MetricsService,
    private readonly tracing: TracingService,
  ) {}

  public async observeDependencies(dependencies: readonly DependencyStatus[]): Promise<void> {
    const settings = this.environment.observabilityAlerts;
    if (!settings.enabled || settings.killSwitch) return;
    if (!(await this.ensureHydrated(dependencies))) return;
    await Promise.all(dependencies.map((dependency) => this.observe(dependency)));
  }

  private async ensureHydrated(dependencies: readonly DependencyStatus[]): Promise<boolean> {
    if (this.hydrated) return true;
    this.hydration ??= this.hydrate(dependencies);
    const hydrated = await this.hydration;
    if (hydrated) this.hydrated = true;
    this.hydration = undefined;
    return hydrated;
  }

  private async hydrate(dependencies: readonly DependencyStatus[]): Promise<boolean> {
    const settings = this.environment.observabilityAlerts;
    const headers: Record<string, string> = { accept: 'application/json' };
    this.tracing.inject(headers);
    try {
      const url = new URL(settings.alertmanagerUrl);
      url.searchParams.set('active', 'true');
      url.searchParams.set('inhibited', 'true');
      url.searchParams.set('silenced', 'true');
      url.searchParams.set('unprocessed', 'true');
      const response = await fetch(url, {
        headers,
        method: 'GET',
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
      if (!response.ok) throw new Error(`Alertmanager returned HTTP ${response.status}`);
      const body = await response.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_ALERTMANAGER_RESPONSE_BYTES) {
        throw new Error('Alertmanager response exceeds the supported size');
      }
      const activeAlerts = this.parseActiveAlerts(JSON.parse(body) as unknown);
      const byDependency = new Map(activeAlerts.map((alert) => [alert.dependency, alert]));
      for (const dependency of dependencies) {
        const active = byDependency.get(dependency.name);
        this.states.set(dependency.name, {
          startedAt: active?.startsAt,
          status: active === undefined ? 'up' : 'down',
        });
      }
      this.logger.event(
        'info',
        { activeCount: activeAlerts.length },
        'dependency_alert_state_hydrated',
      );
      return true;
    } catch (error) {
      this.logger.failure(error, {}, 'dependency_alert_state_hydration_failed');
      return false;
    }
  }

  private parseActiveAlerts(value: unknown): readonly ActiveAlert[] {
    if (!Array.isArray(value) || value.length > MAX_ALERTMANAGER_ALERTS) {
      throw new Error('Alertmanager returned an invalid alerts contract');
    }
    const alerts: ActiveAlert[] = [];
    for (const candidate of value) {
      if (candidate === null || typeof candidate !== 'object') {
        throw new Error('Alertmanager returned an invalid alert');
      }
      const alert = candidate as Record<string, unknown>;
      const labels = alert.labels;
      const status = alert.status;
      if (labels === null || typeof labels !== 'object') continue;
      const labelSet = labels as Record<string, unknown>;
      if (
        labelSet.alertname !== ALERT_NAME ||
        labelSet.service !== ALERT_SERVICE ||
        (labelSet.dependency !== 'minio' &&
          labelSet.dependency !== 'postgres' &&
          labelSet.dependency !== 'redis')
      ) {
        continue;
      }
      if (status === null || typeof status !== 'object') {
        throw new Error('Alertmanager returned an invalid owned alert status');
      }
      const state = (status as Record<string, unknown>).state;
      if (state !== 'active' && state !== 'suppressed' && state !== 'unprocessed') {
        throw new Error('Alertmanager returned an invalid owned alert status');
      }
      const startsAt = typeof alert.startsAt === 'string' ? alert.startsAt : '';
      if (startsAt.length > 64 || !Number.isFinite(new Date(startsAt).getTime())) {
        throw new Error('Alertmanager returned an invalid alert start time');
      }
      alerts.push({ dependency: labelSet.dependency, startsAt });
    }
    return alerts;
  }

  private async observe(dependency: DependencyStatus): Promise<void> {
    const previous = this.states.get(dependency.name);
    if (previous?.status === dependency.status) return;
    if (previous === undefined && dependency.status === 'up') {
      this.states.set(dependency.name, { startedAt: undefined, status: 'up' });
      return;
    }
    const action = dependency.status === 'down' ? 'firing' : 'resolved';
    const now = new Date().toISOString();
    const startedAt = dependency.status === 'down' ? now : (previous?.startedAt ?? now);
    const alert = {
      annotations: { summary: `${dependency.name} dependency is unavailable` },
      labels: {
        alertname: ALERT_NAME,
        dependency: dependency.name,
        service: ALERT_SERVICE,
        severity: 'critical',
      },
      startsAt: startedAt,
      ...(action === 'resolved' ? { endsAt: now } : {}),
    };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    this.tracing.inject(headers);
    try {
      const settings = this.environment.observabilityAlerts;
      const response = await fetch(settings.alertmanagerUrl, {
        body: JSON.stringify([alert]),
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
      if (!response.ok) throw new Error(`Alertmanager returned HTTP ${response.status}`);
      this.states.set(dependency.name, {
        startedAt: dependency.status === 'down' ? startedAt : undefined,
        status: dependency.status,
      });
      this.metrics.recordObservabilityAlert(action, 'success');
      this.logger.event(
        'info',
        { action, dependency: dependency.name },
        'dependency_alert_delivered',
      );
    } catch (error) {
      this.metrics.recordObservabilityAlert(action, 'failure');
      this.logger.failure(
        error,
        { action, dependency: dependency.name },
        'dependency_alert_delivery_failed',
      );
    }
  }
}
