import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  OPERATIONAL_TYPES,
  organizationOptionsSchema,
  principalSchema,
  queueSchema,
  searchSchema,
  summarySchema,
} from '../../../lib/contracts';
import {
  ACCESS_COOKIE,
  apiRequest,
  BffError,
  safeJson,
  upstreamError,
} from '../../../lib/server/bff';
import { errorResponse, jsonResponse } from '../../../lib/server/responses';
import { createDetailReference } from '../../../lib/server/detail-reference';

const ALLOWED_QUERY_KEYS = new Set(['cursor', 'from', 'q', 'to', 'type']);
const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
const querySchema = z
  .object({
    cursor: z.string().min(1).max(768).optional(),
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    q: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .refine((value) => !hasControlCharacters(value))
      .optional(),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    type: z.enum(OPERATIONAL_TYPES).optional(),
  })
  .strict()
  .refine(({ from, to }) => from < to, { message: 'Invalid date range' })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 31 * 24 * 60 * 60 * 1000, {
    message: 'Date range exceeds 31 days',
  });

export async function GET(request: NextRequest) {
  try {
    for (const key of request.nextUrl.searchParams.keys()) {
      if (!ALLOWED_QUERY_KEYS.has(key)) throw new BffError(400, 'Filtro no permitido');
    }
    const parsed = querySchema.safeParse({
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      from: request.nextUrl.searchParams.get('from') ?? undefined,
      q: request.nextUrl.searchParams.get('q') ?? undefined,
      to: request.nextUrl.searchParams.get('to') ?? undefined,
      type: request.nextUrl.searchParams.get('type') ?? undefined,
    });
    if (!parsed.success) throw new BffError(400, 'Rango o filtro inválido');
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const meResponse = await apiRequest('/auth/me', {}, accessToken);
    if (!meResponse.ok) throw upstreamError(meResponse);
    const principal = principalSchema.parse(await safeJson(meResponse));
    const from = parsed.data.from.toISOString();
    const to = parsed.data.to.toISOString();
    const summaryQuery = new URLSearchParams({ from, to });
    const queueQuery = new URLSearchParams({ from, limit: '25', to });
    if (parsed.data.type !== undefined) {
      summaryQuery.set('type', parsed.data.type);
      queueQuery.set('type', parsed.data.type);
    }
    if (parsed.data.cursor !== undefined) queueQuery.set('cursor', parsed.data.cursor);
    const queuePrefix = `/operations/organizations/${principal.organizationId}/queue`;
    const operationsPath =
      parsed.data.q === undefined
        ? `${queuePrefix}?${queueQuery}`
        : `/operations/organizations/${principal.organizationId}/search?${new URLSearchParams({
            ...Object.fromEntries(queueQuery),
            q: parsed.data.q,
          })}`;
    const [optionsResponse, summaryResponse, operationsResponse] = await Promise.all([
      apiRequest('/auth/organizations', {}, accessToken),
      apiRequest(`${queuePrefix}/summary?${summaryQuery}`, {}, accessToken),
      apiRequest(operationsPath, {}, accessToken),
    ]);
    for (const response of [optionsResponse, summaryResponse, operationsResponse]) {
      if (!response.ok) throw upstreamError(response);
    }
    const options = organizationOptionsSchema
      .parse(await safeJson(optionsResponse))
      .filter(({ dashboardAllowed }) => dashboardAllowed);
    const currentOrganization = options.find(
      ({ organizationId }) => organizationId === principal.organizationId,
    );
    if (currentOrganization === undefined) throw new BffError(403, 'Organización no autorizada');
    const summary = summarySchema.parse(await safeJson(summaryResponse));
    const queue = (parsed.data.q === undefined ? queueSchema : searchSchema).parse(
      await safeJson(operationsResponse),
    );
    return jsonResponse({
      currentOrganization,
      nextCursor: queue.nextCursor,
      organizations: options,
      queue: queue.items.map(
        ({ attentionReason, itemId, occurredAt, requiresAttention, status, type }) => ({
          attentionReason,
          detailReference: createDetailReference({
            itemId,
            organizationId: principal.organizationId,
            type,
          }),
          occurredAt,
          requiresAttention,
          status,
          type,
        }),
      ),
      summary,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
