import type { OrganizationRole } from '../generated/prisma/client';

export interface AuthPrincipal {
  readonly email: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
  readonly sessionId: string;
  readonly userId: string;
}

export interface AuthTokens {
  readonly accessExpiresAt: string;
  readonly accessToken: string;
  readonly refreshExpiresAt: string;
  readonly refreshToken: string;
}

export interface AuthOrganizationOption {
  readonly dashboardAllowed: boolean;
  readonly name: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
}
