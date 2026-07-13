-- Expand-only runtime support for leased outbox claims and durable job execution history.
CREATE TYPE "job_execution_status" AS ENUM ('waiting', 'active', 'completed', 'failed', 'dead_letter');

ALTER TABLE "outbox_events"
  ADD COLUMN "locked_at" TIMESTAMPTZ(3),
  ADD COLUMN "locked_by" VARCHAR(128),
  ADD COLUMN "last_error_json" JSONB,
  ADD COLUMN "dead_lettered_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "outbox_events_lock_consistent" CHECK (
    ("status" = 'processing' AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL) OR
    ("status" <> 'processing' AND "locked_at" IS NULL AND "locked_by" IS NULL)
  ),
  ADD CONSTRAINT "outbox_events_dead_letter_consistent" CHECK (
    ("status" = 'dead_letter' AND "dead_lettered_at" IS NOT NULL) OR
    ("status" <> 'dead_letter' AND "dead_lettered_at" IS NULL)
  );

CREATE TABLE "job_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "queue_name" VARCHAR(80) NOT NULL,
  "job_name" VARCHAR(160) NOT NULL,
  "job_id" VARCHAR(128) NOT NULL,
  "correlation_id" VARCHAR(128) NOT NULL,
  "aggregate_id" UUID,
  "status" "job_execution_status" NOT NULL DEFAULT 'waiting',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "error_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_executions_attempt_nonnegative" CHECK ("attempt" >= 0),
  CONSTRAINT "job_executions_queue_name_not_blank" CHECK (length(btrim("queue_name")) > 0),
  CONSTRAINT "job_executions_job_name_not_blank" CHECK (length(btrim("job_name")) > 0),
  CONSTRAINT "job_executions_job_id_not_blank" CHECK (length(btrim("job_id")) > 0),
  CONSTRAINT "job_executions_correlation_id_not_blank" CHECK (length(btrim("correlation_id")) > 0)
);

CREATE UNIQUE INDEX "job_executions_queue_job_key" ON "job_executions"("queue_name", "job_id");
CREATE INDEX "job_executions_status_created_at_idx" ON "job_executions"("status", "created_at");
CREATE INDEX "job_executions_correlation_id_idx" ON "job_executions"("correlation_id");
