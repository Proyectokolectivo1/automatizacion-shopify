import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  isSpanContextValid,
  propagation,
  trace,
  type Context,
  type Span,
  type TextMapGetter,
  type TextMapSetter,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

import { EnvironmentService } from '../config/environment.service';

type HeaderCarrier = Readonly<Record<string, string | readonly string[] | undefined>>;

const headerGetter: TextMapGetter<HeaderCarrier> = {
  get(carrier, key) {
    const value = carrier[key.toLowerCase()];
    return typeof value === 'string' || value === undefined ? value : Array.from(value);
  },
  keys(carrier) {
    return Object.keys(carrier);
  },
};

const headerSetter: TextMapSetter<Record<string, string>> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

@Injectable()
export class TracingService implements OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly sdk: NodeSDK | undefined;

  public constructor(environment: EnvironmentService) {
    const settings = environment.tracing;
    this.enabled = settings.enabled && !settings.killSwitch;
    if (!this.enabled) return;
    this.sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'deployment.environment.name': environment.nodeEnvironment,
        'service.name': settings.serviceName,
      }),
      sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(settings.sampleRatio) }),
      traceExporter: new OTLPTraceExporter({
        timeoutMillis: settings.exporterTimeoutMs,
        url: settings.exporterEndpoint,
      }),
    });
    this.sdk.start();
  }

  public activate<T>(parent: Context, span: Span, callback: () => T): T {
    return otelContext.with(trace.setSpan(parent, span), callback);
  }

  public extract(carrier: HeaderCarrier): Context {
    return this.enabled ? propagation.extract(ROOT_CONTEXT, carrier, headerGetter) : ROOT_CONTEXT;
  }

  public finishHttpSpan(span: Span, route: string, statusCode: number): void {
    span.updateName(`HTTP ${route}`);
    span.setAttribute('http.route', route);
    span.setAttribute('http.response.status_code', statusCode);
    if (statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  }

  public inject(carrier: Record<string, string>): void {
    if (this.enabled) propagation.inject(otelContext.active(), carrier, headerSetter);
  }

  public spanIdentifiers(span: Span): Readonly<{
    spanId: string | undefined;
    traceId: string | undefined;
  }> {
    const spanContext = span.spanContext();
    return isSpanContextValid(spanContext)
      ? { spanId: spanContext.spanId, traceId: spanContext.traceId }
      : { spanId: undefined, traceId: undefined };
  }

  public startHttpSpan(parent: Context, method: string): Span {
    return trace
      .getTracer('ecommerce-api-http')
      .startSpan(
        `HTTP ${method}`,
        { attributes: { 'http.request.method': method }, kind: SpanKind.SERVER },
        parent,
      );
  }

  public async onModuleDestroy(): Promise<void> {
    await this.sdk?.shutdown();
  }
}
