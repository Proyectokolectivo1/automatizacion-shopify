import type { OrganizationRole } from '../generated/prisma/client';

export type Permission = 'organization.manage' | 'organization.read' | 'outbox.manage';

const rolePermissions: Readonly<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  ADMIN: new Set(['organization.manage', 'organization.read', 'outbox.manage']),
  FINANCE: new Set(['organization.read']),
  LOGISTICS: new Set(['organization.read']),
  OPERATIONS: new Set(['organization.read']),
  OWNER: new Set(['organization.manage', 'organization.read', 'outbox.manage']),
  READ_ONLY: new Set(['organization.read']),
  SUPPORT: new Set(['organization.read']),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
