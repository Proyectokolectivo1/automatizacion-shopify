import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestCounter: Counter<'method' | 'route' | 'status_code'>;
  private readonly requestDuration: Histogram<'method' | 'route' | 'status_code'>;
  private readonly dependencyReady: Gauge<'dependency'>;
  private readonly outboxEvents: Counter<'outcome'>;
  private readonly authEvents: Counter<'event' | 'outcome'>;

  public constructor() {
    collectDefaultMetrics({ prefix: 'ecommerce_api_', register: this.registry });
    this.requestCounter = new Counter({
      help: 'Total de respuestas HTTP de la API.',
      labelNames: ['method', 'route', 'status_code'],
      name: 'ecommerce_api_http_requests_total',
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      help: 'Duración de respuestas HTTP de la API en segundos.',
      labelNames: ['method', 'route', 'status_code'],
      name: 'ecommerce_api_http_request_duration_seconds',
      registers: [this.registry],
    });
    this.dependencyReady = new Gauge({
      help: 'Estado de readiness de una dependencia: 1 disponible, 0 no disponible.',
      labelNames: ['dependency'],
      name: 'ecommerce_api_dependency_ready',
      registers: [this.registry],
    });
    this.outboxEvents = new Counter({
      help: 'Eventos procesados por el publicador outbox.',
      labelNames: ['outcome'],
      name: 'ecommerce_api_outbox_events_total',
      registers: [this.registry],
    });
    this.authEvents = new Counter({
      help: 'Eventos de autenticación y autorización por resultado.',
      labelNames: ['event', 'outcome'],
      name: 'ecommerce_api_auth_events_total',
      registers: [this.registry],
    });
  }

  public observeRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.requestCounter.inc(labels);
    this.requestDuration.observe(labels, durationSeconds);
  }

  public setDependencyReady(dependency: string, ready: boolean): void {
    this.dependencyReady.set({ dependency }, ready ? 1 : 0);
  }

  public recordOutbox(outcome: 'claimed' | 'dead_letter' | 'failed' | 'published'): void {
    this.outboxEvents.inc({ outcome });
  }

  public recordAuth(event: string, outcome: string): void {
    this.authEvents.inc({ event, outcome });
  }

  public get contentType(): string {
    return this.registry.contentType;
  }

  public async render(): Promise<string> {
    return this.registry.metrics();
  }
}
