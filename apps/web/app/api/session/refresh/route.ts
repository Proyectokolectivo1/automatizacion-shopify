import type { NextRequest } from 'next/server';

import { authTokensSchema } from '../../../../lib/contracts';
import {
  apiRequest,
  assertCsrf,
  BffError,
  clearSessionCookies,
  REFRESH_COOKIE,
  safeJson,
  setSessionCookies,
  upstreamError,
} from '../../../../lib/server/bff';
import { errorResponse, jsonResponse } from '../../../../lib/server/responses';

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const upstream = await apiRequest('/auth/refresh', {
      body: JSON.stringify({ refreshToken }),
      method: 'POST',
    });
    if (!upstream.ok) {
      const error = upstreamError(upstream);
      const response = errorResponse(error);
      if (upstream.status === 401) clearSessionCookies(response);
      return response;
    }
    const tokens = authTokensSchema.parse(await safeJson(upstream));
    const response = jsonResponse({ authenticated: true });
    setSessionCookies(response, tokens);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
