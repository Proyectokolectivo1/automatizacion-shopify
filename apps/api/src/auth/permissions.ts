import type { OrganizationRole } from '../generated/prisma/client';

export type Permission =
  | 'identity.manage'
  | 'integration.manage'
  | 'organization.manage'
  | 'organization.read'
  | 'outbox.manage'
  | 'reconciliation.manage'
  | 'transport-rates.manage'
  | 'transport-rates.resolve'
  | 'payment-intents.create';

const rolePermissions: Readonly<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  ADMIN: new Set([
    'identity.manage',
    'integration.manage',
    'organization.manage',
    'organization.read',
    'outbox.manage',
    'reconciliation.manage',
    'transport-rates.manage',
    'transport-rates.resolve',
    'payment-intents.create',
  ]),
  FINANCE: new Set(['organization.read']),
  LOGISTICS: new Set(['organization.read']),
  OPERATIONS: new Set([
    'organization.read',
    'reconciliation.manage',
    'transport-rates.resolve',
    'payment-intents.create',
  ]),
  OWNER: new Set([
    'identity.manage',
    'integration.manage',
    'organization.manage',
    'organization.read',
    'outbox.manage',
    'reconciliation.manage',
    'transport-rates.manage',
    'transport-rates.resolve',
    'payment-intents.create',
  ]),
  READ_ONLY: new Set(['organization.read']),
  SUPPORT: new Set(['organization.read']),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
