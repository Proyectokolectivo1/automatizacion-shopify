-- Expand-only ownership and replay generation for tenant-safe outbox operations.
ALTER TABLE "outbox_events"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "delivery_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reprocess_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "job_executions"
  ADD COLUMN "organization_id" UUID,
  ADD COLUMN "event_id" UUID;

UPDATE "outbox_events" AS event
SET "organization_id" = event."aggregate_id"
WHERE event."aggregate_type" = 'organization'
  AND EXISTS (SELECT 1 FROM "organizations" AS organization WHERE organization."id" = event."aggregate_id");

UPDATE "outbox_events" AS event
SET "organization_id" = store."organization_id"
FROM "stores" AS store
WHERE event."organization_id" IS NULL
  AND event."aggregate_type" = 'store'
  AND store."id" = event."aggregate_id";

UPDATE "job_executions" AS execution
SET "event_id" = event."id",
    "organization_id" = event."organization_id"
FROM "outbox_events" AS event
WHERE execution."job_id" = event."id"::text;

UPDATE "job_executions" AS execution
SET "organization_id" = organization."id"
FROM "organizations" AS organization
WHERE execution."organization_id" IS NULL
  AND execution."aggregate_id" = organization."id";

UPDATE "job_executions" AS execution
SET "organization_id" = store."organization_id"
FROM "stores" AS store
WHERE execution."organization_id" IS NULL
  AND execution."aggregate_id" = store."id";

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "outbox_events_organization_id_required"
    CHECK ("organization_id" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "outbox_events_delivery_version_positive"
    CHECK ("delivery_version" > 0),
  ADD CONSTRAINT "outbox_events_reprocess_count_nonnegative"
    CHECK ("reprocess_count" >= 0);

ALTER TABLE "job_executions"
  ADD CONSTRAINT "job_executions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "job_executions_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "job_executions_organization_id_required"
    CHECK ("organization_id" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "job_executions_event_id_required"
    CHECK ("event_id" IS NOT NULL) NOT VALID;

CREATE INDEX "outbox_events_organization_status_created_idx"
  ON "outbox_events"("organization_id", "status", "created_at");
CREATE INDEX "job_executions_organization_status_created_idx"
  ON "job_executions"("organization_id", "status", "created_at");
CREATE INDEX "job_executions_event_created_idx"
  ON "job_executions"("event_id", "created_at");
