import { Injectable, type LoggerService } from '@nestjs/common';
import { type Logger } from 'pino';

import { EnvironmentService } from '../config/environment.service';
import { createPinoLogger } from './logger.factory';
import { RequestContextService } from './request-context.service';

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: Logger;

  public constructor(
    environment: EnvironmentService,
    private readonly requestContext: RequestContextService,
  ) {
    this.logger = createPinoLogger(environment.logLevel, environment.nodeEnvironment);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('debug', message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('error', message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('fatal', message, optionalParams);
  }

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('info', message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('trace', message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.writeNestLog('warn', message, optionalParams);
  }

  public event(
    level: 'debug' | 'info' | 'warn',
    bindings: Readonly<Record<string, unknown>>,
    message: string,
  ): void {
    this.logger[level](this.withContext(bindings), message);
  }

  public failure(
    error: unknown,
    bindings: Readonly<Record<string, unknown>>,
    message: string,
  ): void {
    this.logger.error(this.withContext({ ...bindings, err: this.normalizeError(error) }), message);
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Non-Error exception');
  }

  private withContext(bindings: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return {
      ...bindings,
      correlationId: this.requestContext.correlationId,
    };
  }

  private writeNestLog(
    level: 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn',
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    const context = optionalParams.find((value) => typeof value === 'string');
    const text = typeof message === 'string' ? message : 'Structured NestJS log';
    this.logger[level](this.withContext({ context, payload: message }), text);
  }
}
