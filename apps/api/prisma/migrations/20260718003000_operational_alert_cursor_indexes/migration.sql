DROP INDEX operational_alerts_tenant_status_cursor_idx;
DROP INDEX operational_alerts_tenant_type_status_cursor_idx;

CREATE INDEX operational_alerts_tenant_status_cursor_idx
  ON operational_alerts (organization_id, status, last_detected_at, id);

CREATE INDEX operational_alerts_tenant_type_status_cursor_idx
  ON operational_alerts (organization_id, item_type, status, last_detected_at, id);

