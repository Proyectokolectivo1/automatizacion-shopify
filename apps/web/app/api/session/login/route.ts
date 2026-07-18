import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { authTokensSchema, organizationOptionsSchema } from '../../../../lib/contracts';
import {
  apiRequest,
  assertTrustedOrigin,
  BffError,
  safeJson,
  setSessionCookies,
  upstreamError,
} from '../../../../lib/server/bff';
import { errorResponse, jsonResponse } from '../../../../lib/server/responses';

const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    organizationId: z.string().uuid().optional(),
    password: z.string().min(12).max(128),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) throw new BffError(400, 'Solicitud inválida');
    const { email, organizationId, password } = parsed.data;
    const optionsResponse = await apiRequest('/auth/login-options', {
      body: JSON.stringify({ email, password }),
      method: 'POST',
    });
    if (!optionsResponse.ok) throw upstreamError(optionsResponse);
    const options = organizationOptionsSchema.parse(await safeJson(optionsResponse));
    const allowed = options.filter(({ dashboardAllowed }) => dashboardAllowed);
    if (allowed.length === 0) throw new BffError(403, 'No tienes acceso al dashboard operativo');
    if (organizationId === undefined && allowed.length !== 1) {
      return jsonResponse({ organizations: allowed, selectionRequired: true }, 409);
    }
    const selectedId = organizationId ?? allowed[0]?.organizationId;
    if (
      selectedId === undefined ||
      !allowed.some((option) => option.organizationId === selectedId)
    ) {
      throw new BffError(400, 'La organización seleccionada no está disponible');
    }
    const loginResponse = await apiRequest('/auth/login', {
      body: JSON.stringify({ email, organizationId: selectedId, password }),
      method: 'POST',
    });
    if (!loginResponse.ok) throw upstreamError(loginResponse);
    const tokens = authTokensSchema.parse(await safeJson(loginResponse));
    const response = jsonResponse({ authenticated: true });
    setSessionCookies(response, tokens);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
