import type { OperationalQueueItemType } from './operational-read-model';

export interface OperationalAlertRule {
  readonly condition: string;
  readonly key: string;
  readonly matchingStatuses: readonly string[];
  readonly type: OperationalQueueItemType;
  readonly version: 1;
}

export const OPERATIONAL_ALERT_RULES_V1 = [
  {
    condition: 'status_requires_attention',
    key: 'order_attention',
    matchingStatuses: [
      'invalid_data',
      'transport_payment_expired',
      'abandono_pago_transporte',
      'manual_review',
    ],
    type: 'order',
    version: 1,
  },
  {
    condition: 'status_requires_attention',
    key: 'payment_intent_attention',
    matchingStatuses: ['error'],
    type: 'payment_intent',
    version: 1,
  },
  {
    condition: 'status_requires_attention',
    key: 'shopify_reconciliation_attention',
    matchingStatuses: ['open', 'reprocessing'],
    type: 'shopify_reconciliation_issue',
    version: 1,
  },
  {
    condition: 'open_and_unassigned',
    key: 'whatsapp_conversation_attention',
    matchingStatuses: ['open'],
    type: 'whatsapp_conversation',
    version: 1,
  },
  {
    condition: 'status_requires_attention',
    key: 'wompi_reconciliation_attention',
    matchingStatuses: ['open'],
    type: 'wompi_reconciliation_issue',
    version: 1,
  },
] as const satisfies readonly OperationalAlertRule[];
