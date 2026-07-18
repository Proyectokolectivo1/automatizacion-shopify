CREATE TYPE "payment_provider_event_status" AS ENUM ('accepted', 'rejected');

CREATE UNIQUE INDEX "payment_intents_provider_checkout_id_key"
  ON "payment_intents"("provider", "provider_checkout_id")
  WHERE "provider_checkout_id" IS NOT NULL;

CREATE TABLE "payment_provider_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "payment_intent_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL DEFAULT 'wompi',
  "event_type" VARCHAR(80) NOT NULL,
  "external_event_key" CHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(128) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "signature_valid" BOOLEAN NOT NULL,
  "status" "payment_provider_event_status" NOT NULL,
  "provider_status" "payment_intent_status" NOT NULL,
  "rejection_reason" VARCHAR(80),
  "payload_redacted_json" JSONB NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_provider_events_wompi_only" CHECK ("provider" = 'wompi'),
  CONSTRAINT "payment_provider_events_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
  CONSTRAINT "payment_provider_events_external_key_format" CHECK ("external_event_key" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "payment_provider_events_payload_hash_format" CHECK ("payload_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "payment_provider_events_transaction_not_blank" CHECK (length(btrim("provider_transaction_id")) > 0),
  CONSTRAINT "payment_provider_events_rejection_consistency" CHECK (
    ("status" = 'accepted' AND "signature_valid" AND "rejection_reason" IS NULL)
    OR ("status" = 'rejected' AND "rejection_reason" IS NOT NULL)
  ),
  CONSTRAINT "payment_provider_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_provider_events_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_provider_events_intent_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id", "payment_intent_id")
    REFERENCES "payment_intents"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_provider_events_provider_external_key"
  ON "payment_provider_events"("provider", "external_event_key");
CREATE INDEX "payment_provider_events_tenant_status_received_idx"
  ON "payment_provider_events"("organization_id", "status", "received_at");
CREATE INDEX "payment_provider_events_intent_received_idx"
  ON "payment_provider_events"("payment_intent_id", "received_at");
