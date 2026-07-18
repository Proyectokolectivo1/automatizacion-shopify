-- Expand-only Shopify webhook ingress. No subscriptions or external calls are enabled here.
CREATE TYPE "webhook_event_status" AS ENUM (
  'received', 'processing', 'processed', 'failed', 'dead_letter'
);

ALTER TABLE "integration_connections"
  ADD COLUMN "encrypted_webhook_secret" JSONB;

ALTER TABLE "integration_connections"
  ADD CONSTRAINT "integration_connections_webhook_secret_envelope"
    CHECK (
      "encrypted_webhook_secret" IS NULL OR (
        jsonb_typeof("encrypted_webhook_secret") = 'object' AND
        "encrypted_webhook_secret" ?& ARRAY['version', 'iv', 'authTag', 'ciphertext'] AND
        "encrypted_webhook_secret" - ARRAY['version', 'iv', 'authTag', 'ciphertext'] = '{}'::jsonb AND
        jsonb_typeof("encrypted_webhook_secret"->'version') = 'string' AND
        jsonb_typeof("encrypted_webhook_secret"->'iv') = 'string' AND
        jsonb_typeof("encrypted_webhook_secret"->'authTag') = 'string' AND
        jsonb_typeof("encrypted_webhook_secret"->'ciphertext') = 'string' AND
        length("encrypted_webhook_secret"->>'version') > 0 AND
        length("encrypted_webhook_secret"->>'iv') > 0 AND
        length("encrypted_webhook_secret"->>'authTag') > 0 AND
        length("encrypted_webhook_secret"->>'ciphertext') > 0
      )
    );

CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL,
  "external_event_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(160) NOT NULL,
  "api_version" VARCHAR(32) NOT NULL,
  "signature_valid" BOOLEAN NOT NULL DEFAULT true,
  "headers_redacted_json" JSONB NOT NULL,
  "payload_redacted_json" JSONB NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "status" "webhook_event_status" NOT NULL DEFAULT 'received',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "triggered_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  "error_code" VARCHAR(80),
  "error_message" VARCHAR(500),
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_external_event_id_not_blank"
    CHECK (length(btrim("external_event_id")) > 0),
  CONSTRAINT "webhook_events_event_type_not_blank"
    CHECK (length(btrim("event_type")) > 0),
  CONSTRAINT "webhook_events_api_version_not_blank"
    CHECK (length(btrim("api_version")) > 0),
  CONSTRAINT "webhook_events_payload_hash_format"
    CHECK ("payload_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "webhook_events_attempt_count_nonnegative"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "webhook_events_shopify_only"
    CHECK ("provider" = 'shopify'),
  CONSTRAINT "webhook_events_verified_only"
    CHECK ("signature_valid" = true),
  CONSTRAINT "webhook_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "webhook_events_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "webhook_events_store_type_external_key"
  ON "webhook_events"("store_id", "event_type", "external_event_id");
CREATE INDEX "webhook_events_organization_status_received_idx"
  ON "webhook_events"("organization_id", "status", "received_at");
CREATE INDEX "webhook_events_store_type_triggered_idx"
  ON "webhook_events"("store_id", "event_type", "triggered_at");
CREATE INDEX "webhook_events_payload_hash_idx"
  ON "webhook_events"("payload_hash");
