import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  ACCESS_COOKIE,
  apiRequest,
  assertCsrf,
  BffError,
  clearSessionCookies,
  NO_STORE_HEADERS,
} from '../../../../lib/server/bff';
import { errorResponse } from '../../../../lib/server/responses';

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
    if (accessToken === undefined) throw new BffError(401, 'Sesión no disponible');
    const upstream = await apiRequest('/auth/logout', { method: 'POST' }, accessToken);
    if (!upstream.ok && upstream.status !== 401) {
      throw new BffError(503, 'No fue posible revocar la sesión');
    }
    const response = new NextResponse(null, { headers: NO_STORE_HEADERS, status: 204 });
    clearSessionCookies(response);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
