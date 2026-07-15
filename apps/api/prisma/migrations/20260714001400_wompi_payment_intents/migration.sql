CREATE TYPE "payment_intent_status" AS ENUM (
  'pending',
  'approved',
  'declined',
  'expired',
  'voided',
  'error'
);

CREATE TABLE "payment_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL DEFAULT 'wompi',
  "external_reference" VARCHAR(255) NOT NULL,
  "provider_checkout_id" VARCHAR(128),
  "checkout_url" VARCHAR(2048) NOT NULL,
  "amount" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "payment_intent_status" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_intents_provider_wompi" CHECK ("provider" = 'wompi'),
  CONSTRAINT "payment_intents_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "payment_intents_currency_cop" CHECK ("currency" = 'COP'),
  CONSTRAINT "payment_intents_attempt_positive" CHECK ("attempt_number" > 0),
  CONSTRAINT "payment_intents_reference_not_blank" CHECK (btrim("external_reference") <> ''),
  CONSTRAINT "payment_intents_expiration_after_creation" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "payment_intents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_intents_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_intents_order_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "order_id") REFERENCES "orders"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_intents_idempotency_key"
  ON "payment_intents"("idempotency_key");
CREATE UNIQUE INDEX "payment_intents_provider_reference_attempt_key"
  ON "payment_intents"("provider", "external_reference", "attempt_number");
CREATE UNIQUE INDEX "payment_intents_organization_store_id_key"
  ON "payment_intents"("organization_id", "store_id", "id");
CREATE UNIQUE INDEX "payment_intents_one_pending_order_key"
  ON "payment_intents"("order_id") WHERE "status" = 'pending';
CREATE INDEX "payment_intents_tenant_status_expires_idx"
  ON "payment_intents"("organization_id", "status", "expires_at");
CREATE INDEX "payment_intents_order_created_idx"
  ON "payment_intents"("order_id", "created_at");
