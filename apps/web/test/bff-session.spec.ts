import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as dashboard } from '../app/api/dashboard/route';
import { POST as login } from '../app/api/session/login/route';
import { POST as logout } from '../app/api/session/logout/route';
import { POST as refresh } from '../app/api/session/refresh/route';
import { cookieOptions } from '../lib/server/bff';

const origin = 'http://localhost:3000';
const organizationId = '10000000-0000-4000-8000-000000000001';
const storeId = '10000000-0000-4000-8000-000000000002';
const accessToken = '10000000-0000-4000-8000-000000000003.secret-access';
const refreshToken = '10000000-0000-4000-8000-000000000003.secret-refresh';

const tokens = {
  accessExpiresAt: '2026-07-18T12:00:00.000Z',
  accessToken,
  refreshExpiresAt: '2026-08-18T12:00:00.000Z',
  refreshToken,
};

const organization = {
  dashboardAllowed: true,
  name: 'Kolectivo',
  organizationId,
  role: 'OWNER',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function postRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, ...headers },
    method: 'POST',
  });
}

describe('E6-H3A secure web BFF', () => {
  beforeEach(() => {
    process.env.API_INTERNAL_BASE_URL = 'http://api.internal:3001';
    process.env.WEB_ORIGIN = origin;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_INTERNAL_BASE_URL;
    delete process.env.WEB_ORIGIN;
  });

  it('uses HttpOnly SameSite cookies and enables Secure in production', () => {
    expect(cookieOptions(new Date(0), true, false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
    expect(cookieOptions(new Date(0), true, true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  });

  it('creates a web session without exposing API tokens to JavaScript', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([organization]))
      .mockResolvedValueOnce(json(tokens));
    vi.stubGlobal('fetch', upstream);
    const response = await login(
      postRequest('/api/session/login', {
        email: 'owner@example.test',
        password: 'Correct-password-123',
      }),
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ authenticated: true });
    const cookies = response.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('ei_access=');
    expect(cookies).toContain('ei_refresh=');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=lax');
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken/u);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('requires selection only from active memberships returned by the backend', async () => {
    const second = {
      ...organization,
      name: 'Otra organización',
      organizationId: '10000000-0000-4000-8000-000000000004',
    };
    const upstream = vi.fn<typeof fetch>().mockResolvedValueOnce(json([organization, second]));
    vi.stubGlobal('fetch', upstream);
    const response = await login(
      postRequest('/api/session/login', {
        email: 'owner@example.test',
        password: 'Correct-password-123',
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      organizations: [organization, second],
      selectionRequired: true,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects session mutations without same-origin CSRF proof', async () => {
    const upstream = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', upstream);
    const request = postRequest(
      '/api/session/logout',
      {},
      {
        cookie: `ei_access=${accessToken}; ei_csrf=csrf-cookie-value-that-is-long-enough`,
      },
    );
    const response = await logout(request);
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rotates cookies through a CSRF-protected refresh without returning tokens', async () => {
    const csrf = 'csrf-cookie-value-that-is-long-enough';
    const upstream = vi.fn<typeof fetch>().mockResolvedValueOnce(json(tokens));
    vi.stubGlobal('fetch', upstream);
    const request = postRequest(
      '/api/session/refresh',
      {},
      {
        cookie: `ei_refresh=${refreshToken}; ei_csrf=${csrf}`,
        'x-csrf-token': csrf,
      },
    );
    const response = await refresh(request);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ authenticated: true });
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|secret-/u);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('revokes upstream before expiring all browser session cookies', async () => {
    const csrf = 'csrf-cookie-value-that-is-long-enough';
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', upstream);
    const request = postRequest(
      '/api/session/logout',
      {},
      {
        cookie: `ei_access=${accessToken}; ei_csrf=${csrf}`,
        'x-csrf-token': csrf,
      },
    );
    const response = await logout(request);
    expect(response.status).toBe(204);
    const cookies = response.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('ei_access=');
    expect(cookies).toContain('ei_refresh=');
    expect(cookies).toContain('Expires=Thu, 01 Jan 1970');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('derives the tenant from the authenticated API principal and strips resource identifiers', async () => {
    const upstream = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === 'string'
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`);
      if (url.pathname === '/auth/me') {
        return Promise.resolve(
          json({
            email: 'owner@example.test',
            organizationId,
            role: 'OWNER',
            sessionId: '10000000-0000-4000-8000-000000000003',
            userId: '10000000-0000-4000-8000-000000000005',
          }),
        );
      }
      if (url.pathname === '/auth/organizations') return Promise.resolve(json([organization]));
      expect(url.pathname).toContain(`/operations/organizations/${organizationId}/queue`);
      if (url.pathname.endsWith('/summary')) {
        return Promise.resolve(
          json({
            byStatus: [{ requiresAttention: 1, status: 'open', total: 1 }],
            byType: [{ requiresAttention: 1, total: 1, type: 'order' }],
            contractVersion: 'v1',
            filters: { storeId: null, type: null },
            totals: { requiresAttention: 1, total: 1 },
            window: { from: '2026-07-17T00:00:00.000Z', to: '2026-07-18T00:00:00.000Z' },
          }),
        );
      }
      return Promise.resolve(
        json({
          contractVersion: 'v1',
          items: [
            {
              attentionReason: 'order_manual_review',
              itemId: 'resource-id-must-not-reach-browser',
              occurredAt: '2026-07-17T12:00:00.000Z',
              relatedResource: null,
              requiresAttention: true,
              status: 'manual_review',
              storeId,
              type: 'order',
            },
          ],
          nextCursor: 'opaque-next-cursor',
        }),
      );
    });
    vi.stubGlobal('fetch', upstream);
    const request = new NextRequest(
      `${origin}/api/dashboard?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    const response = await dashboard(request);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain('resource-id-must-not-reach-browser');
    expect(serialized).not.toContain(storeId);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).toContain('opaque-next-cursor');
  });

  it('rejects browser-provided organization identifiers before contacting the API', async () => {
    const upstream = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', upstream);
    const request = new NextRequest(
      `${origin}/api/dashboard?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z&organizationId=${organizationId}`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    const response = await dashboard(request);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
