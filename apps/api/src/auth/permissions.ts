import type { OrganizationRole } from '../generated/prisma/client';

export type Permission =
  | 'identity.manage'
  | 'integration.manage'
  | 'organization.manage'
  | 'organization.read'
  | 'operations.alerts.read'
  | 'operations.detail.read'
  | 'operations.export.read'
  | 'operations.queue.read'
  | 'operations.search.read'
  | 'outbox.manage'
  | 'finance.overview.read'
  | 'reconciliation.manage'
  | 'transport-rates.manage'
  | 'transport-rates.resolve'
  | 'payment-intents.create'
  | 'whatsapp-conversations.read'
  | 'whatsapp-conversations.claim'
  | 'whatsapp-conversations.assign'
  | 'whatsapp-messages.dispatch';

const rolePermissions: Readonly<Record<OrganizationRole, ReadonlySet<Permission>>> = {
  ADMIN: new Set([
    'identity.manage',
    'integration.manage',
    'organization.manage',
    'organization.read',
    'operations.alerts.read',
    'operations.detail.read',
    'operations.export.read',
    'operations.queue.read',
    'operations.search.read',
    'outbox.manage',
    'finance.overview.read',
    'reconciliation.manage',
    'transport-rates.manage',
    'transport-rates.resolve',
    'payment-intents.create',
    'whatsapp-conversations.read',
    'whatsapp-conversations.claim',
    'whatsapp-conversations.assign',
    'whatsapp-messages.dispatch',
  ]),
  FINANCE: new Set(['organization.read', 'finance.overview.read']),
  LOGISTICS: new Set(['organization.read']),
  OPERATIONS: new Set([
    'organization.read',
    'operations.alerts.read',
    'operations.detail.read',
    'operations.queue.read',
    'operations.search.read',
    'reconciliation.manage',
    'transport-rates.resolve',
    'payment-intents.create',
    'whatsapp-conversations.read',
    'whatsapp-conversations.claim',
    'whatsapp-conversations.assign',
    'whatsapp-messages.dispatch',
  ]),
  OWNER: new Set([
    'identity.manage',
    'integration.manage',
    'organization.manage',
    'organization.read',
    'operations.alerts.read',
    'operations.detail.read',
    'operations.export.read',
    'operations.queue.read',
    'operations.search.read',
    'outbox.manage',
    'finance.overview.read',
    'reconciliation.manage',
    'transport-rates.manage',
    'transport-rates.resolve',
    'payment-intents.create',
    'whatsapp-conversations.read',
    'whatsapp-conversations.claim',
    'whatsapp-conversations.assign',
    'whatsapp-messages.dispatch',
  ]),
  READ_ONLY: new Set(['organization.read']),
  SUPPORT: new Set([
    'organization.read',
    'whatsapp-conversations.read',
    'whatsapp-conversations.claim',
  ]),
};

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
