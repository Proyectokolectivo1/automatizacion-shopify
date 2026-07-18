import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { NextRequest, NextResponse } from 'next/server';

import { authTokensSchema } from '../contracts';

export const ACCESS_COOKIE = 'ei_access';
export const CSRF_COOKIE = 'ei_csrf';
export const REFRESH_COOKIE = 'ei_refresh';
export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
} as const;

export class BffError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function apiBaseUrl(): URL {
  const raw = process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:3001';
  const parsed = new URL(raw);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new BffError(503, 'Configuración interna no disponible');
  }
  return parsed;
}

export function apiRequest(
  pathname: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const target = new URL(pathname, apiBaseUrl());
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken !== undefined) headers.set('authorization', `Bearer ${accessToken}`);
  const configuredTimeout = Number(process.env.WEB_API_TIMEOUT_MS ?? 5_000);
  const timeoutMs =
    Number.isInteger(configuredTimeout) && configuredTimeout >= 500 && configuredTimeout <= 30_000
      ? configuredTimeout
      : 5_000;
  return fetch(target, {
    ...init,
    cache: 'no-store',
    headers,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

export function assertTrustedOrigin(request: NextRequest): void {
  const origin = request.headers.get('origin');
  const configured = process.env.WEB_ORIGIN;
  if (process.env.NODE_ENV === 'production' && configured === undefined) {
    throw new BffError(503, 'Origen web no configurado');
  }
  const expected = configured ?? request.nextUrl.origin;
  if (origin === null || origin !== expected) throw new BffError(403, 'Origen no autorizado');
}

export function assertCsrf(request: NextRequest): void {
  assertTrustedOrigin(request);
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get('x-csrf-token');
  const cookieBuffer = Buffer.from(cookieToken ?? '');
  const headerBuffer = Buffer.from(headerToken ?? '');
  if (
    cookieToken === undefined ||
    headerToken === null ||
    cookieBuffer.length < 32 ||
    cookieBuffer.length !== headerBuffer.length ||
    !timingSafeEqual(cookieBuffer, headerBuffer)
  ) {
    throw new BffError(403, 'Protección CSRF inválida');
  }
}

export function cookieOptions(expires: Date, httpOnly: boolean, production: boolean) {
  return {
    expires,
    httpOnly,
    path: '/',
    sameSite: 'lax' as const,
    secure: production,
  };
}

export function setSessionCookies(response: NextResponse, rawTokens: unknown): void {
  const tokens = authTokensSchema.parse(rawTokens);
  const production = process.env.NODE_ENV === 'production';
  const refreshExpiry = new Date(tokens.refreshExpiresAt);
  response.cookies.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(new Date(tokens.accessExpiresAt), true, production),
  );
  response.cookies.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(refreshExpiry, true, production),
  );
  response.cookies.set(
    CSRF_COOKIE,
    randomBytes(32).toString('base64url'),
    cookieOptions(refreshExpiry, false, production),
  );
}

export function clearSessionCookies(response: NextResponse): void {
  const expired = new Date(0);
  const production = process.env.NODE_ENV === 'production';
  for (const [name, httpOnly] of [
    [ACCESS_COOKIE, true],
    [REFRESH_COOKIE, true],
    [CSRF_COOKIE, false],
  ] as const) {
    response.cookies.set(name, '', cookieOptions(expired, httpOnly, production));
  }
}

export async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new BffError(502, 'Respuesta interna inválida');
  }
}

export function upstreamError(response: Response): BffError {
  if (response.status === 401) return new BffError(401, 'Sesión o credenciales inválidas');
  if (response.status === 403) return new BffError(403, 'Acceso no autorizado');
  if (response.status === 429) return new BffError(429, 'Demasiados intentos; inténtalo más tarde');
  if (response.status === 503)
    return new BffError(503, 'La operación está temporalmente deshabilitada');
  return new BffError(502, 'El servicio interno no respondió correctamente');
}
