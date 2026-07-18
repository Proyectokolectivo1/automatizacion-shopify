import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AppLoggerService } from './app-logger.service';
import { resolveCorrelationId } from './correlation-id';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context.service';
import { TracingService } from './tracing.service';

const CORRELATION_HEADER = 'x-correlation-id';

function routeLabel(request: Request): string {
  const route: unknown = request.route;
  if (
    typeof route === 'object' &&
    route !== null &&
    'path' in route &&
    typeof route.path === 'string'
  ) {
    return route.path;
  }
  return 'unmatched';
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  public constructor(
    private readonly context: RequestContextService,
    private readonly logger: AppLoggerService,
    private readonly metrics: MetricsService,
    private readonly tracing: TracingService,
  ) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
    const startedAt = process.hrtime.bigint();
    const parent = this.tracing.extract(request.headers);
    const span = this.tracing.startHttpSpan(parent, request.method);
    const identifiers = this.tracing.spanIdentifiers(span);
    response.setHeader(CORRELATION_HEADER, correlationId);
    if (identifiers.traceId !== undefined) response.setHeader('x-trace-id', identifiers.traceId);
    if (identifiers.spanId !== undefined) response.setHeader('x-span-id', identifiers.spanId);

    this.tracing.activate(parent, span, () =>
      this.context.run({ correlationId, ...identifiers }, () => {
        this.logger.event(
          'info',
          { method: request.method, path: request.path },
          'request_received',
        );
        response.once('finish', () => {
          const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
          const route = routeLabel(request);
          this.metrics.observeRequest(request.method, route, response.statusCode, durationSeconds);
          this.logger.event(
            'info',
            {
              durationMs: Math.round(durationSeconds * 1_000),
              method: request.method,
              route,
              statusCode: response.statusCode,
            },
            'request_completed',
          );
          this.tracing.finishHttpSpan(span, `${request.method} ${route}`, response.statusCode);
        });
        next();
      }),
    );
  }
}
