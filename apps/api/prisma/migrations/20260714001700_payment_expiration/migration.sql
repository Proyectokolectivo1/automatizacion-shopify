ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'transport_payment_expired';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'abandono_pago_transporte';
ALTER TYPE "order_state" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "payment_abandonment_action" AS ENUM ('mark', 'cancel');

ALTER TABLE "payment_intents"
  ADD COLUMN "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN "abandonment_action" "payment_abandonment_action" NOT NULL DEFAULT 'mark';

UPDATE "payment_intents"
SET "expired_at" = "updated_at"
WHERE "status" = 'expired' AND "expired_at" IS NULL;

ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_expired_state_consistency" CHECK (
    ("status" = 'expired' AND "expired_at" IS NOT NULL)
    OR ("status" <> 'expired' AND "expired_at" IS NULL)
  );

CREATE INDEX "payment_intents_status_expires_idx"
  ON "payment_intents"("status", "expires_at");
