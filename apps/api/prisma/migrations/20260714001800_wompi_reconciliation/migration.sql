CREATE TYPE "payment_reconciliation_run_status" AS ENUM ('completed', 'failed');
CREATE TYPE "payment_reconciliation_issue_type" AS ENUM (
  'intent_status_mismatch',
  'event_status_mismatch',
  'missing_accepted_event',
  'transaction_data_mismatch'
);
CREATE TYPE "payment_reconciliation_issue_status" AS ENUM ('open', 'resolved');

CREATE TABLE "payment_reconciliation_checkpoints" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL DEFAULT 'wompi',
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "window_ended_at" TIMESTAMPTZ(3) NOT NULL,
  "last_run_at" TIMESTAMPTZ(3) NOT NULL,
  "next_run_at" TIMESTAMPTZ(3) NOT NULL,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_failure_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reconciliation_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliation_checkpoints_window_check" CHECK (
    "window_started_at" <= "window_ended_at"
    AND "last_run_at" = "window_ended_at"
    AND "next_run_at" > "last_run_at"
    AND "consecutive_failures" >= 0
    AND (("consecutive_failures" = 0 AND "last_failure_at" IS NULL)
      OR ("consecutive_failures" > 0 AND "last_failure_at" IS NOT NULL))
  )
);

CREATE TABLE "payment_reconciliation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "checkpoint_id" UUID,
  "provider" "integration_provider" NOT NULL DEFAULT 'wompi',
  "status" "payment_reconciliation_run_status" NOT NULL,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "window_ended_at" TIMESTAMPTZ(3) NOT NULL,
  "scanned_count" INTEGER NOT NULL,
  "difference_count" INTEGER NOT NULL,
  "new_issue_count" INTEGER NOT NULL,
  "resolved_count" INTEGER NOT NULL,
  "report_json" JSONB NOT NULL,
  "failure_code" VARCHAR(80),
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reconciliation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliation_runs_shape_check" CHECK (
    "window_started_at" <= "window_ended_at"
    AND "started_at" <= "completed_at"
    AND "scanned_count" >= 0
    AND "difference_count" >= 0
    AND "new_issue_count" >= 0
    AND "resolved_count" >= 0
    AND (("status" = 'completed' AND "failure_code" IS NULL)
      OR ("status" = 'failed' AND "failure_code" IS NOT NULL))
  )
);

CREATE TABLE "payment_reconciliation_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "last_detected_run_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL DEFAULT 'wompi',
  "issue_type" "payment_reconciliation_issue_type" NOT NULL,
  "status" "payment_reconciliation_issue_status" NOT NULL DEFAULT 'open',
  "fingerprint" CHAR(64) NOT NULL,
  "local_status" "payment_intent_status",
  "accepted_event_status" "payment_intent_status",
  "authoritative_status" "payment_intent_status",
  "detail_json" JSONB NOT NULL,
  "detection_count" INTEGER NOT NULL DEFAULT 1,
  "first_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reconciliation_issues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reconciliation_issues_shape_check" CHECK (
    "fingerprint" ~ '^[a-f0-9]{64}$'
    AND "detection_count" > 0
    AND "first_detected_at" <= "last_detected_at"
    AND (("status" = 'open' AND "resolved_at" IS NULL)
      OR ("status" = 'resolved' AND "resolved_at" IS NOT NULL))
  )
);

CREATE UNIQUE INDEX "payment_reconciliation_checkpoints_store_provider_key"
  ON "payment_reconciliation_checkpoints"("store_id", "provider");
CREATE UNIQUE INDEX "payment_reconciliation_checkpoints_tenant_id_key"
  ON "payment_reconciliation_checkpoints"("organization_id", "store_id", "id");
CREATE INDEX "payment_reconciliation_checkpoints_provider_next_run_idx"
  ON "payment_reconciliation_checkpoints"("provider", "next_run_at");
CREATE INDEX "payment_reconciliation_checkpoints_tenant_run_idx"
  ON "payment_reconciliation_checkpoints"("organization_id", "last_run_at");

CREATE UNIQUE INDEX "payment_reconciliation_runs_tenant_id_key"
  ON "payment_reconciliation_runs"("organization_id", "store_id", "id");
CREATE INDEX "payment_reconciliation_runs_tenant_status_idx"
  ON "payment_reconciliation_runs"("organization_id", "status", "completed_at");
CREATE INDEX "payment_reconciliation_runs_store_window_idx"
  ON "payment_reconciliation_runs"("store_id", "window_ended_at");

CREATE UNIQUE INDEX "payment_reconciliation_issues_store_fingerprint_key"
  ON "payment_reconciliation_issues"("store_id", "fingerprint");
CREATE INDEX "payment_reconciliation_issues_tenant_status_idx"
  ON "payment_reconciliation_issues"("organization_id", "status", "last_detected_at");
CREATE INDEX "payment_reconciliation_issues_intent_status_idx"
  ON "payment_reconciliation_issues"("payment_intent_id", "status");

ALTER TABLE "payment_reconciliation_checkpoints"
  ADD CONSTRAINT "payment_reconciliation_checkpoints_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_checkpoints_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_reconciliation_runs"
  ADD CONSTRAINT "payment_reconciliation_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_runs_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_runs_checkpoint_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "checkpoint_id")
  REFERENCES "payment_reconciliation_checkpoints"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_reconciliation_issues"
  ADD CONSTRAINT "payment_reconciliation_issues_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_issues_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_issues_intent_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "payment_intent_id")
  REFERENCES "payment_intents"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_reconciliation_issues_run_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "last_detected_run_id")
  REFERENCES "payment_reconciliation_runs"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
