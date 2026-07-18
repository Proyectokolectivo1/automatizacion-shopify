import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { BffError, NO_STORE_HEADERS } from './bff';

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE_HEADERS, status });
}

export function errorResponse(error: unknown): NextResponse {
  const safe =
    error instanceof BffError
      ? error
      : error instanceof ZodError
        ? new BffError(502, 'Respuesta interna inválida')
        : error instanceof TypeError ||
            (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name))
          ? new BffError(503, 'La API interna no está disponible')
          : new BffError(500, 'Error interno');
  return jsonResponse({ error: safe.message }, safe.status);
}
