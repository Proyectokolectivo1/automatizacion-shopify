CREATE TYPE operational_alert_status AS ENUM ('open', 'resolved');

CREATE TABLE operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  rule_key VARCHAR(80) NOT NULL,
  rule_version INTEGER NOT NULL,
  item_type VARCHAR(64) NOT NULL,
  status operational_alert_status NOT NULL DEFAULT 'open',
  observed_count INTEGER NOT NULL,
  window_started_at TIMESTAMPTZ(3) NOT NULL,
  window_ended_at TIMESTAMPTZ(3) NOT NULL,
  first_detected_at TIMESTAMPTZ(3) NOT NULL,
  last_detected_at TIMESTAMPTZ(3) NOT NULL,
  last_evaluated_at TIMESTAMPTZ(3) NOT NULL,
  resolved_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT operational_alerts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_alerts_rule_version_check CHECK (rule_version > 0),
  CONSTRAINT operational_alerts_observed_count_check CHECK (observed_count >= 0),
  CONSTRAINT operational_alerts_window_check CHECK (window_started_at < window_ended_at),
  CONSTRAINT operational_alerts_detection_order_check CHECK (
    first_detected_at <= last_detected_at AND last_detected_at <= last_evaluated_at
  ),
  CONSTRAINT operational_alerts_resolution_shape_check CHECK (
    (status = 'open' AND observed_count > 0 AND resolved_at IS NULL)
    OR
    (status = 'resolved' AND observed_count = 0 AND resolved_at IS NOT NULL
      AND resolved_at >= first_detected_at)
  ),
  CONSTRAINT operational_alerts_rule_shape_check CHECK (
    (rule_key = 'order_attention' AND item_type = 'order')
    OR (rule_key = 'payment_intent_attention' AND item_type = 'payment_intent')
    OR (rule_key = 'shopify_reconciliation_attention'
      AND item_type = 'shopify_reconciliation_issue')
    OR (rule_key = 'whatsapp_conversation_attention'
      AND item_type = 'whatsapp_conversation')
    OR (rule_key = 'wompi_reconciliation_attention'
      AND item_type = 'wompi_reconciliation_issue')
  )
);

CREATE UNIQUE INDEX operational_alerts_open_dedupe_idx
  ON operational_alerts (organization_id, rule_key, rule_version)
  WHERE status = 'open';

CREATE INDEX operational_alerts_tenant_status_cursor_idx
  ON operational_alerts (organization_id, status, last_detected_at DESC, id DESC);

CREATE INDEX operational_alerts_tenant_type_status_cursor_idx
  ON operational_alerts (organization_id, item_type, status, last_detected_at DESC, id DESC);

