import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as dashboard } from '../app/api/dashboard/route';
import { GET as operationalDetail } from '../app/api/operations/detail/route';
import { GET as operationalExport } from '../app/api/operations/export/route';
import { POST as login } from '../app/api/session/login/route';
import { POST as logout } from '../app/api/session/logout/route';
import { POST as refresh } from '../app/api/session/refresh/route';
import { cookieOptions } from '../lib/server/bff';
import { createDetailReference, readDetailReference } from '../lib/server/detail-reference';
import { operationalExportCsv } from '../lib/server/operational-csv';

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
    process.env.WEB_DETAIL_REFERENCE_KEY = Buffer.alloc(32, 7).toString('base64url');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_INTERNAL_BASE_URL;
    delete process.env.WEB_ORIGIN;
    delete process.env.WEB_DETAIL_REFERENCE_KEY;
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
              itemId: '10000000-0000-4000-8000-000000000099',
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
    expect(serialized).not.toContain('10000000-0000-4000-8000-000000000099');
    expect(serialized).not.toContain(storeId);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain('owner@example.test');
    expect(serialized).toContain('opaque-next-cursor');
  });

  it('routes bounded searches through the tenant-safe API and strips search metadata', async () => {
    const upstream = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === 'string'
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
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
      if (url.pathname.endsWith('/queue/summary')) {
        return Promise.resolve(
          json({
            byStatus: [{ requiresAttention: 1, status: 'manual_review', total: 1 }],
            byType: [{ requiresAttention: 1, total: 1, type: 'order' }],
            contractVersion: 'v1',
            filters: { storeId: null, type: null },
            totals: { requiresAttention: 1, total: 1 },
            window: { from: '2026-07-17T00:00:00.000Z', to: '2026-07-18T00:00:00.000Z' },
          }),
        );
      }
      expect(url.pathname).toBe(`/operations/organizations/${organizationId}/search`);
      expect(url.searchParams.get('q')).toBe('manual review');
      expect(url.searchParams.get('from')).toBe('2026-07-17T00:00:00.000Z');
      expect(url.searchParams.get('to')).toBe('2026-07-18T00:00:00.000Z');
      return Promise.resolve(
        json({
          contractVersion: 'v1',
          items: [
            {
              attentionReason: 'order_manual_review',
              itemId: '10000000-0000-4000-8000-000000000099',
              matchKind: 'exact_field',
              occurredAt: '2026-07-17T12:00:00.000Z',
              requiresAttention: true,
              status: 'manual_review',
              type: 'order',
            },
          ],
          nextCursor: null,
        }),
      );
    });
    vi.stubGlobal('fetch', upstream);
    const request = new NextRequest(
      `${origin}/api/dashboard?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z&q=manual%20review`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    const response = await dashboard(request);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('order_manual_review');
    expect(serialized).not.toContain('10000000-0000-4000-8000-000000000099');
    expect(serialized).not.toContain('matchKind');
    expect(serialized).not.toContain('manual review');
  });

  it('encrypts short-lived detail references and rejects expiry, tampering or another tenant', () => {
    const now = Date.parse('2026-07-18T10:00:00.000Z');
    const payload = {
      itemId: '10000000-0000-4000-8000-000000000099',
      organizationId,
      type: 'order' as const,
    };
    const reference = createDetailReference(payload, now);
    expect(reference).not.toContain(payload.itemId);
    expect(reference).not.toContain(organizationId);
    expect(readDetailReference(reference, organizationId, now)).toEqual(payload);
    expect(() => readDetailReference(`${reference}x`, organizationId, now)).toThrow();
    expect(() =>
      readDetailReference(reference, '10000000-0000-4000-8000-000000000004', now),
    ).toThrow();
    expect(() => readDetailReference(reference, organizationId, now + 15 * 60 * 1000)).toThrow();
  });

  it('resolves detail through the authenticated tenant without returning references or identifiers', async () => {
    const itemId = '10000000-0000-4000-8000-000000000099';
    const reference = createDetailReference({ itemId, organizationId, type: 'order' });
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
      expect(url.pathname).toBe(
        `/operations/organizations/${organizationId}/items/order/${itemId}`,
      );
      return Promise.resolve(
        json({
          contractVersion: 'v1',
          item: {
            attentionReason: 'order_manual_review',
            details: {
              codCollectAmount: '0',
              currency: 'COP',
              kind: 'order',
              paymentMode: 'prepaid',
              totalAmount: '10000',
              transportChargeAmount: '0',
              version: 2,
            },
            occurredAt: '2026-07-17T12:00:00.000Z',
            requiresAttention: true,
            status: 'manual_review',
            type: 'order',
          },
          timeline: [
            {
              at: '2026-07-17T12:01:00.000Z',
              event: 'state_transition',
              fromStatus: 'validating',
              toStatus: 'manual_review',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', upstream);
    const request = new NextRequest(
      `${origin}/api/operations/detail?${new URLSearchParams({ reference })}`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    const response = await operationalDetail(request);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('manual_review');
    expect(serialized).not.toContain(itemId);
    expect(serialized).not.toContain(reference);
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain('owner@example.test');

    const tampered = new NextRequest(`${origin}/api/operations/detail?reference=${reference}x`, {
      headers: { cookie: `ei_access=${accessToken}` },
    });
    expect((await operationalDetail(tampered)).status).toBe(400);
  });

  it('serializes RFC 4180 CSV and neutralizes spreadsheet formulas', () => {
    const csv = operationalExportCsv({
      contractVersion: 'v1',
      rows: [
        {
          attentionReason: '=HYPERLINK("https://invalid")',
          occurredAt: '2026-07-17T12:00:00.000Z',
          requiresAttention: true,
          status: '  +cmd|calc',
          type: 'order',
        },
      ],
      truncated: false,
      window: { from: '2026-07-17T00:00:00.000Z', to: '2026-07-18T00:00:00.000Z' },
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('"\'  +cmd|calc"');
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
    expect(csv).not.toContain('\n=HYPERLINK');
  });

  it('downloads a tenant-derived bounded CSV with safe headers and owner-only access', async () => {
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
      expect(url.pathname).toBe(`/operations/organizations/${organizationId}/export`);
      expect(url.searchParams.get('limit')).toBe('1000');
      return Promise.resolve(
        json({
          contractVersion: 'v1',
          rows: [
            {
              attentionReason: 'order_manual_review',
              occurredAt: '2026-07-17T12:00:00.000Z',
              requiresAttention: true,
              status: 'manual_review',
              type: 'order',
            },
          ],
          truncated: false,
          window: {
            from: '2026-07-17T00:00:00.000Z',
            to: '2026-07-18T00:00:00.000Z',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', upstream);
    const request = new NextRequest(
      `${origin}/api/operations/export?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z&limit=1000`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    const response = await operationalExport(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-export-row-count')).toBe('1');
    const csv = await response.text();
    expect(csv).toContain('order_manual_review');
    expect(csv).not.toContain(organizationId);
    expect(csv).not.toContain('owner@example.test');
    expect(csv).not.toContain(accessToken);

    const invalid = new NextRequest(
      `${origin}/api/operations/export?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    expect((await operationalExport(invalid)).status).toBe(400);
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

    const shortQuery = new NextRequest(
      `${origin}/api/dashboard?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z&q=x`,
      { headers: { cookie: `ei_access=${accessToken}` } },
    );
    expect((await dashboard(shortQuery)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
