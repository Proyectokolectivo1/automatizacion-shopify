-- Expand-only simulated Shopify reconciliation checkpoints and durable issues.
CREATE TYPE "reconciliation_issue_type" AS ENUM ('missing_order', 'failed_webhook', 'stuck_order');
CREATE TYPE "reconciliation_issue_status" AS ENUM ('open', 'reprocessing', 'resolved');

ALTER TABLE "webhook_events"
  ADD COLUMN "reconciliation_generated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "webhook_events"
  DROP CONSTRAINT "webhook_events_verified_only";

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_verified_or_reconciled"
  CHECK ("signature_valid" OR "reconciliation_generated");

ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_reconciliation_signature_consistency"
  CHECK (NOT "reconciliation_generated" OR NOT "signature_valid");

CREATE TABLE "reconciliation_checkpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL,
  "provider_cursor" VARCHAR(512),
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "window_ended_at" TIMESTAMPTZ(3) NOT NULL,
  "last_run_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reconciliation_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reconciliation_checkpoints_window_order"
    CHECK ("window_ended_at" > "window_started_at"),
  CONSTRAINT "reconciliation_checkpoints_cursor_not_blank"
    CHECK ("provider_cursor" IS NULL OR length(btrim("provider_cursor")) > 0),
  CONSTRAINT "reconciliation_checkpoints_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reconciliation_checkpoints_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reconciliation_checkpoints_store_provider_key"
  ON "reconciliation_checkpoints"("store_id", "provider");
CREATE INDEX "reconciliation_checkpoints_tenant_run_idx"
  ON "reconciliation_checkpoints"("organization_id", "last_run_at");

CREATE TABLE "order_reconciliation_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL,
  "issue_type" "reconciliation_issue_type" NOT NULL,
  "status" "reconciliation_issue_status" NOT NULL DEFAULT 'open',
  "fingerprint" CHAR(64) NOT NULL,
  "provider_resource_id" VARCHAR(128),
  "webhook_event_id" UUID,
  "order_id" UUID,
  "evidence_json" JSONB NOT NULL DEFAULT '{}',
  "detection_count" INTEGER NOT NULL DEFAULT 1,
  "first_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reprocess_started_at" TIMESTAMPTZ(3),
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_reconciliation_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_reconciliation_issues_fingerprint_format"
    CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "order_reconciliation_issues_detection_count_positive"
    CHECK ("detection_count" > 0),
  CONSTRAINT "order_reconciliation_issues_reference_present"
    CHECK (
      "provider_resource_id" IS NOT NULL OR
      "webhook_event_id" IS NOT NULL OR
      "order_id" IS NOT NULL
    ),
  CONSTRAINT "order_reconciliation_issues_resolution_consistent"
    CHECK (
      ("status" = 'resolved' AND "resolved_at" IS NOT NULL) OR
      ("status" <> 'resolved' AND "resolved_at" IS NULL)
    ),
  CONSTRAINT "order_reconciliation_issues_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_reconciliation_issues_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_reconciliation_issues_webhook_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "webhook_event_id")
    REFERENCES "webhook_events"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_reconciliation_issues_order_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "order_id")
    REFERENCES "orders"("organization_id", "store_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_reconciliation_issues_store_fingerprint_key"
  ON "order_reconciliation_issues"("store_id", "fingerprint");
CREATE INDEX "order_reconciliation_issues_tenant_status_idx"
  ON "order_reconciliation_issues"("organization_id", "status", "last_detected_at");
CREATE INDEX "order_reconciliation_issues_store_type_status_idx"
  ON "order_reconciliation_issues"("store_id", "issue_type", "status");
