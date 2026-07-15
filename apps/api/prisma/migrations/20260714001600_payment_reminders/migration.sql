CREATE TYPE "payment_reminder_status" AS ENUM ('scheduled', 'requested', 'cancelled');

CREATE TABLE "payment_reminders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "payment_reminder_status" NOT NULL DEFAULT 'scheduled',
  "requested_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "cancellation_reason" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reminders_sequence_range" CHECK ("sequence" IN (1, 2)),
  CONSTRAINT "payment_reminders_state_consistency" CHECK (
    ("status" = 'scheduled' AND "requested_at" IS NULL AND "cancelled_at" IS NULL AND "cancellation_reason" IS NULL)
    OR ("status" = 'requested' AND "requested_at" IS NOT NULL AND "cancelled_at" IS NULL AND "cancellation_reason" IS NULL)
    OR ("status" = 'cancelled' AND "requested_at" IS NULL AND "cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
  ),
  CONSTRAINT "payment_reminders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_reminders_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_reminders_intent_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "payment_intent_id")
    REFERENCES "payment_intents"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_reminders_intent_sequence_key"
  ON "payment_reminders"("payment_intent_id", "sequence");
CREATE INDEX "payment_reminders_status_scheduled_idx"
  ON "payment_reminders"("status", "scheduled_at");
CREATE INDEX "payment_reminders_tenant_status_scheduled_idx"
  ON "payment_reminders"("organization_id", "status", "scheduled_at");

INSERT INTO "payment_reminders"
  ("organization_id", "store_id", "payment_intent_id", "sequence", "scheduled_at")
SELECT "organization_id", "store_id", "id", schedule."sequence",
       "created_at" + (schedule."hours" * INTERVAL '1 hour')
FROM "payment_intents"
CROSS JOIN (VALUES (1, 8), (2, 16)) AS schedule("sequence", "hours")
WHERE "status" = 'pending'
ON CONFLICT ("payment_intent_id", "sequence") DO NOTHING;
