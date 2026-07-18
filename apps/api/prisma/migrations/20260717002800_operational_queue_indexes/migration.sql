-- E6-H1A is a read projection. These indexes keep every UNION branch tenant-bounded
-- and ordered by an immutable timestamp plus UUID without adding a new source of truth.
CREATE INDEX "orders_operational_queue_idx"
  ON "orders"("organization_id", "source_created_at", "id");

CREATE INDEX "order_reconciliation_issues_operational_queue_idx"
  ON "order_reconciliation_issues"("organization_id", "first_detected_at", "id");

CREATE INDEX "payment_intents_operational_queue_idx"
  ON "payment_intents"("organization_id", "created_at", "id");

CREATE INDEX "payment_reconciliation_issues_operational_queue_idx"
  ON "payment_reconciliation_issues"("organization_id", "first_detected_at", "id");

CREATE INDEX "whatsapp_conversations_operational_queue_idx"
  ON "whatsapp_conversations"("organization_id", "created_at", "id");
