import { Prisma } from '../generated/prisma/client';

export const OPERATIONAL_ITEM_TYPES = [
  'order',
  'payment_intent',
  'shopify_reconciliation_issue',
  'whatsapp_conversation',
  'wompi_reconciliation_issue',
] as const;

export const OPERATIONAL_ITEM_STATUSES = [
  'abandono_pago_transporte',
  'approved',
  'cancelled',
  'closed',
  'declined',
  'error',
  'expired',
  'invalid_data',
  'manual_review',
  'open',
  'pending',
  'pending_transport_payment',
  'ready_for_logistics',
  'ready_for_payment_classification',
  'received',
  'reprocessing',
  'resolved',
  'transport_payment_expired',
  'validating',
  'voided',
] as const;

export type OperationalQueueItemType = (typeof OPERATIONAL_ITEM_TYPES)[number];

const operationalItemsForTenantPredicate = (tenantPredicate: Prisma.Sql): Prisma.Sql => Prisma.sql`
  SELECT
    organization_id,
    'order'::text AS item_type,
    id::text AS item_id,
    store_id::text AS store_id,
    current_state::text AS status,
    source_created_at AS occurred_at,
    current_state IN ('invalid_data', 'transport_payment_expired', 'abandono_pago_transporte', 'manual_review') AS requires_attention,
    CASE WHEN current_state IN ('invalid_data', 'transport_payment_expired', 'abandono_pago_transporte', 'manual_review')
      THEN 'order_' || current_state::text ELSE NULL END AS attention_reason,
    NULL::text AS related_resource_type,
    NULL::text AS related_resource_id,
    'order:' || id::text AS sort_key
  FROM orders WHERE ${tenantPredicate}
  UNION ALL
  SELECT
    organization_id, 'shopify_reconciliation_issue', id::text, store_id::text, status::text, first_detected_at,
    status IN ('open', 'reprocessing'),
    CASE WHEN status IN ('open', 'reprocessing') THEN 'shopify_' || issue_type::text ELSE NULL END,
    CASE WHEN order_id IS NULL THEN NULL ELSE 'order' END,
    order_id::text,
    'shopify_reconciliation_issue:' || id::text
  FROM order_reconciliation_issues WHERE ${tenantPredicate}
  UNION ALL
  SELECT
    organization_id, 'payment_intent', id::text, store_id::text, status::text, created_at,
    status = 'error',
    CASE WHEN status = 'error' THEN 'payment_intent_error' ELSE NULL END,
    'order', order_id::text, 'payment_intent:' || id::text
  FROM payment_intents WHERE ${tenantPredicate}
  UNION ALL
  SELECT
    organization_id, 'wompi_reconciliation_issue', id::text, store_id::text, status::text, first_detected_at,
    status = 'open',
    CASE WHEN status = 'open' THEN 'wompi_' || issue_type::text ELSE NULL END,
    'payment_intent', payment_intent_id::text,
    'wompi_reconciliation_issue:' || id::text
  FROM payment_reconciliation_issues WHERE ${tenantPredicate}
  UNION ALL
  SELECT
    organization_id, 'whatsapp_conversation', id::text, store_id::text, status::text, created_at,
    status = 'open' AND assigned_membership_id IS NULL,
    CASE WHEN status = 'open' AND assigned_membership_id IS NULL
      THEN 'whatsapp_conversation_unassigned' ELSE NULL END,
    NULL::text, NULL::text, 'whatsapp_conversation:' || id::text
  FROM whatsapp_conversations WHERE ${tenantPredicate}
`;

export const operationalItemsSql = (organizationId: string): Prisma.Sql =>
  operationalItemsForTenantPredicate(Prisma.sql`organization_id = ${organizationId}::uuid`);

export const operationalItemsForOrganizationsSql = (
  organizationIds: readonly string[],
): Prisma.Sql => {
  if (organizationIds.length === 0) throw new Error('At least one organization is required');
  const ids = organizationIds.map((organizationId) => Prisma.sql`${organizationId}::uuid`);
  return operationalItemsForTenantPredicate(Prisma.sql`organization_id IN (${Prisma.join(ids)})`);
};
