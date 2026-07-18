import { Injectable } from '@nestjs/common';

import { type DependencyStatus } from '../health/dependency-health.service';
import { EnvironmentService } from '../config/environment.service';
import { AppLoggerService } from './app-logger.service';
import { MetricsService } from './metrics.service';
import { TracingService } from './tracing.service';

interface AlertState {
  readonly startedAt: string | undefined;
  readonly status: DependencyStatus['status'];
}

@Injectable()
export class AlertingService {
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
    await Promise.all(dependencies.map((dependency) => this.observe(dependency)));
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
        alertname: 'EcommerceDependencyUnavailable',
        dependency: dependency.name,
        service: 'api',
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
