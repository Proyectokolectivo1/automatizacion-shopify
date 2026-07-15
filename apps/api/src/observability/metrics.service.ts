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
  private readonly outboxOperations: Counter<'action' | 'outcome'>;
  private readonly identityOperations: Counter<'action' | 'outcome'>;
  private readonly shopifyOperations: Counter<'action' | 'outcome'>;
  private readonly shopifyWebhooks: Counter<'outcome' | 'topic'>;
  private readonly shopifyOrderSyncs: Counter<'outcome'>;
  private readonly orderClassifications: Counter<'outcome'>;
  private readonly shopifyReconciliations: Counter<'action' | 'outcome'>;
  private readonly transportRateOperations: Counter<'action' | 'outcome'>;
  private readonly paymentIntentOperations: Counter<'action' | 'outcome'>;
  private readonly wompiReconciliations: Counter<'action' | 'outcome'>;

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
    this.outboxOperations = new Counter({
      help: 'Operaciones acotadas sobre la cola de eventos fallidos.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_outbox_operations_total',
      registers: [this.registry],
    });
    this.identityOperations = new Counter({
      help: 'Operaciones administrativas acotadas sobre identidades y membresías.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_identity_operations_total',
      registers: [this.registry],
    });
    this.shopifyOperations = new Counter({
      help: 'Operaciones acotadas sobre integraciones Shopify por resultado.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_shopify_operations_total',
      registers: [this.registry],
    });
    this.shopifyWebhooks = new Counter({
      help: 'Entregas de webhook Shopify simuladas por topic y resultado acotados.',
      labelNames: ['topic', 'outcome'],
      name: 'ecommerce_api_shopify_webhooks_total',
      registers: [this.registry],
    });
    this.shopifyOrderSyncs = new Counter({
      help: 'Sincronizaciones normalizadas de pedidos Shopify por resultado acotado.',
      labelNames: ['outcome'],
      name: 'ecommerce_api_shopify_order_sync_total',
      registers: [this.registry],
    });
    this.orderClassifications = new Counter({
      help: 'Clasificaciones de pago de pedidos por resultado acotado.',
      labelNames: ['outcome'],
      name: 'ecommerce_api_order_classifications_total',
      registers: [this.registry],
    });
    this.shopifyReconciliations = new Counter({
      help: 'Operaciones de conciliación Shopify simuladas por resultado acotado.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_shopify_reconciliations_total',
      registers: [this.registry],
    });
    this.transportRateOperations = new Counter({
      help: 'Operaciones de tarifas de transporte simuladas por resultado acotado.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_transport_rate_operations_total',
      registers: [this.registry],
    });
    this.paymentIntentOperations = new Counter({
      help: 'Operaciones de intenciones Wompi simuladas por resultado acotado.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_payment_intent_operations_total',
      registers: [this.registry],
    });
    this.wompiReconciliations = new Counter({
      help: 'Ejecuciones de conciliación Wompi simuladas por resultado acotado.',
      labelNames: ['action', 'outcome'],
      name: 'ecommerce_api_wompi_reconciliations_total',
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

  public recordOutboxOperation(action: string, outcome: string): void {
    this.outboxOperations.inc({ action, outcome });
  }

  public recordIdentityOperation(action: string, outcome: string): void {
    this.identityOperations.inc({ action, outcome });
  }

  public recordShopifyOperation(action: string, outcome: string): void {
    this.shopifyOperations.inc({ action, outcome });
  }

  public recordShopifyWebhook(topic: string, outcome: string): void {
    this.shopifyWebhooks.inc({ outcome, topic });
  }

  public recordShopifyOrderSync(outcome: string): void {
    this.shopifyOrderSyncs.inc({ outcome });
  }

  public recordOrderClassification(outcome: string): void {
    this.orderClassifications.inc({ outcome });
  }

  public recordShopifyReconciliation(action: string, outcome: string): void {
    this.shopifyReconciliations.inc({ action, outcome });
  }

  public recordTransportRate(action: string, outcome: string): void {
    this.transportRateOperations.inc({ action, outcome });
  }

  public recordPaymentIntent(action: string, outcome: string): void {
    this.paymentIntentOperations.inc({ action, outcome });
  }

  public recordWompiReconciliation(action: string, outcome: string): void {
    this.wompiReconciliations.inc({ action, outcome });
  }

  public get contentType(): string {
    return this.registry.contentType;
  }

  public async render(): Promise<string> {
    return this.registry.metrics();
  }
}
