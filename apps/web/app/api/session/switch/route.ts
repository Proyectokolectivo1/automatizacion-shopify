import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { authTokensSchema, organizationOptionsSchema } from '../../../../lib/contracts';
import {
  ACCESS_COOKIE,
  apiRequest,
  assertCsrf,
  BffError,
  safeJson,
  setSessionCookies,
  upstreamError,
} from '../../../../lib/server/bff';
import { errorResponse, jsonResponse } from '../../../../lib/server/responses';

const switchSchema = z.object({ organizationId: z.string().uuid() }).strict();

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const parsed = switchSchema.safeParse(await request.json());
    if (!parsed.success) throw new BffError(400, 'Solicitud inválida');
    const optionsResponse = await apiRequest('/auth/organizations', {}, accessToken);
    if (!optionsResponse.ok) throw upstreamError(optionsResponse);
    const options = organizationOptionsSchema.parse(await safeJson(optionsResponse));
    const target = options.find(
      ({ dashboardAllowed, organizationId }) =>
        dashboardAllowed && organizationId === parsed.data.organizationId,
    );
    if (target === undefined) throw new BffError(403, 'Organización no autorizada');
    const upstream = await apiRequest(
      '/auth/switch-organization',
      { body: JSON.stringify(parsed.data), method: 'POST' },
      accessToken,
    );
    if (!upstream.ok) throw upstreamError(upstream);
    const tokens = authTokensSchema.parse(await safeJson(upstream));
    const response = jsonResponse({ authenticated: true });
    setSessionCookies(response, tokens);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
