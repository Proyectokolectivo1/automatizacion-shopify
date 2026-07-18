import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { operationalDetailSchema, principalSchema } from '../../../../lib/contracts';
import {
  ACCESS_COOKIE,
  apiRequest,
  BffError,
  safeJson,
  upstreamError,
} from '../../../../lib/server/bff';
import { readDetailReference } from '../../../../lib/server/detail-reference';
import { errorResponse, jsonResponse } from '../../../../lib/server/responses';

const ALLOWED_QUERY_KEYS = new Set(['reference']);
const querySchema = z.object({ reference: z.string().min(1).max(768) }).strict();

export async function GET(request: NextRequest) {
  try {
    for (const key of request.nextUrl.searchParams.keys()) {
      if (!ALLOWED_QUERY_KEYS.has(key)) throw new BffError(400, 'Filtro no permitido');
    }
    const parsed = querySchema.safeParse({
      reference: request.nextUrl.searchParams.get('reference') ?? undefined,
    });
    if (!parsed.success) throw new BffError(400, 'Referencia de detalle inválida');
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const meResponse = await apiRequest('/auth/me', {}, accessToken);
    if (!meResponse.ok) throw upstreamError(meResponse);
    const principal = principalSchema.parse(await safeJson(meResponse));
    const reference = readDetailReference(parsed.data.reference, principal.organizationId);
    const response = await apiRequest(
      `/operations/organizations/${principal.organizationId}/items/${reference.type}/${reference.itemId}`,
      {},
      accessToken,
    );
    if (!response.ok) throw upstreamError(response);
    return jsonResponse(operationalDetailSchema.parse(await safeJson(response)));
  } catch (error) {
    return errorResponse(error);
  }
}
