import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';

interface ErrorResponse {
  readonly correlationId: string;
  readonly error: string;
  readonly message: string | readonly string[];
  readonly path: string;
  readonly statusCode: number;
  readonly timestamp: string;
}

function publicMessage(exception: HttpException): string | readonly string[] {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = response.message;
    if (
      typeof message === 'string' ||
      (Array.isArray(message) && message.every((item) => typeof item === 'string'))
    ) {
      return message;
    }
  }
  return 'Request failed';
}

function isPayloadTooLargeError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const candidate = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  return (
    candidate.status === HttpStatus.PAYLOAD_TOO_LARGE &&
    candidate.statusCode === HttpStatus.PAYLOAD_TOO_LARGE &&
    candidate.type === 'entity.too.large'
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  public constructor(
    private readonly logger: AppLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const payloadTooLarge = isPayloadTooLargeError(exception);
    const statusCode = isHttpException
      ? exception.getStatus()
      : payloadTooLarge
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const correlationId = this.requestContext.correlationId ?? 'unavailable';
    const body: ErrorResponse = {
      correlationId,
      error: HttpStatus[statusCode] ?? 'Error',
      message:
        isHttpException && statusCode < 500
          ? publicMessage(exception)
          : payloadTooLarge
            ? 'Request body exceeds the configured limit'
            : 'Internal server error',
      path: request.path,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= 500) {
      this.logger.failure(
        exception,
        { method: request.method, path: request.path, statusCode },
        'request_failed',
      );
    } else {
      this.logger.event(
        'warn',
        { method: request.method, path: request.path, statusCode },
        'request_rejected',
      );
    }

    response.status(statusCode).json(body);
  }
}
