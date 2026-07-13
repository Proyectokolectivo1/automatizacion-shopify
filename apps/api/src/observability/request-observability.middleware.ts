import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AppLoggerService } from './app-logger.service';
import { resolveCorrelationId } from './correlation-id';
import { MetricsService } from './metrics.service';
import { RequestContextService } from './request-context.service';

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
  ) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(request.headers[CORRELATION_HEADER]);
    const startedAt = process.hrtime.bigint();
    response.setHeader(CORRELATION_HEADER, correlationId);

    this.context.run(correlationId, () => {
      this.logger.event('info', { method: request.method, path: request.path }, 'request_received');
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
      });
      next();
    });
  }
}
