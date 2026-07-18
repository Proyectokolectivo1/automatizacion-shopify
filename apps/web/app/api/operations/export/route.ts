import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  OPERATIONAL_TYPES,
  operationalExportSchema,
  principalSchema,
} from '../../../../lib/contracts';
import {
  ACCESS_COOKIE,
  apiRequest,
  BffError,
  NO_STORE_HEADERS,
  safeJson,
  upstreamError,
} from '../../../../lib/server/bff';
import { operationalExportCsv } from '../../../../lib/server/operational-csv';
import { errorResponse } from '../../../../lib/server/responses';

const ALLOWED_QUERY_KEYS = new Set(['from', 'limit', 'requiresAttention', 'to', 'type']);
const querySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    limit: z.coerce.number().int().min(1).max(1_000).default(1_000),
    requiresAttention: z.enum(['false', 'true']).optional(),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    type: z.enum(OPERATIONAL_TYPES).optional(),
  })
  .strict()
  .refine(({ from, to }) => from < to, { message: 'Invalid date range' })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 7 * 24 * 60 * 60 * 1000, {
    message: 'Date range exceeds 7 days',
  });

export async function GET(request: NextRequest) {
  try {
    for (const key of request.nextUrl.searchParams.keys()) {
      if (!ALLOWED_QUERY_KEYS.has(key)) throw new BffError(400, 'Filtro no permitido');
    }
    const parsed = querySchema.safeParse({
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      requiresAttention: request.nextUrl.searchParams.get('requiresAttention') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      type: request.nextUrl.searchParams.get('type') ?? undefined,
    });
    if (!parsed.success) throw new BffError(400, 'Rango o filtro de exportación inválido');
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const meResponse = await apiRequest('/auth/me', {}, accessToken);
    if (!meResponse.ok) throw upstreamError(meResponse);
    const principal = principalSchema.parse(await safeJson(meResponse));
    if (!['ADMIN', 'OWNER'].includes(principal.role)) {
      throw new BffError(403, 'Acceso no autorizado');
    }
    const query = new URLSearchParams({
      from: parsed.data.from.toISOString(),
      limit: String(parsed.data.limit),
      to: parsed.data.to.toISOString(),
    });
    if (parsed.data.type !== undefined) query.set('type', parsed.data.type);
    if (parsed.data.requiresAttention !== undefined) {
      query.set('requiresAttention', parsed.data.requiresAttention);
    }
    const response = await apiRequest(
      `/operations/organizations/${principal.organizationId}/export?${query}`,
      {},
      accessToken,
    );
    if (!response.ok) throw upstreamError(response);
    const value = operationalExportSchema.parse(await safeJson(response));
    const stamp = value.window.to.slice(0, 10).replaceAll('-', '');
    return new NextResponse(operationalExportCsv(value), {
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Disposition': `attachment; filename="operaciones-${stamp}.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
        'X-Export-Row-Count': String(value.rows.length),
        'X-Export-Truncated': String(value.truncated),
      },
      status: 200,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
