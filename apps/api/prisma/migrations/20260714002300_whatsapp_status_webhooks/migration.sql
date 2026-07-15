-- Durable, authenticated WhatsApp status webhook simulation. No Meta traffic is enabled.
CREATE TYPE "whatsapp_status_webhook_outcome" AS ENUM ('applied', 'ignored');

ALTER TABLE "whatsapp_messages"
  DROP CONSTRAINT "whatsapp_messages_simulation_shape_check";

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_simulation_shape_check" CHECK (
    "direction" = 'outbound'
    AND "type" = 'template'
    AND "provider_message_id" ~ '^simulated:[0-9a-f]{32,64}$'
    AND "business_key_hash" ~ '^[0-9a-f]{64}$'
    AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
    AND char_length("body") BETWEEN 1 AND 4096
    AND jsonb_typeof("metadata_json") = 'object'
    AND COALESCE("metadata_json" ->> 'mode' = 'simulation', false)
    AND COALESCE("metadata_json" ->> 'fixtureVersion' = 'v1', false)
    AND (
      (
        "status" = 'simulated_accepted'
        AND "sent_at" IS NULL
        AND "delivered_at" IS NULL
        AND "read_at" IS NULL
        AND "failed_at" IS NULL
      ) OR (
        "status" = 'simulated_sent'
        AND "sent_at" IS NOT NULL
        AND "delivered_at" IS NULL
        AND "read_at" IS NULL
        AND "failed_at" IS NULL
      ) OR (
        "status" = 'simulated_delivered'
        AND "delivered_at" IS NOT NULL
        AND "read_at" IS NULL
        AND "failed_at" IS NULL
      ) OR (
        "status" = 'simulated_read'
        AND "read_at" IS NOT NULL
        AND "failed_at" IS NULL
      ) OR (
        "status" = 'simulated_failed'
        AND "failed_at" IS NOT NULL
        AND "delivered_at" IS NULL
        AND "read_at" IS NULL
      )
    )
  );

CREATE TABLE "whatsapp_status_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "message_id" UUID,
  "external_event_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "fixture_version" VARCHAR(16) NOT NULL,
  "observed_status" "whatsapp_message_status" NOT NULL,
  "outcome" "whatsapp_status_webhook_outcome" NOT NULL,
  "rejection_reason" VARCHAR(80),
  "signature_valid" BOOLEAN NOT NULL DEFAULT true,
  "payload_hash" CHAR(64) NOT NULL,
  "provider_message_id_hash" CHAR(64) NOT NULL,
  "payload_redacted_json" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "whatsapp_status_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_status_webhook_events_external_not_blank"
    CHECK (length(btrim("external_event_id")) > 0),
  CONSTRAINT "whatsapp_status_webhook_events_event_type_check"
    CHECK ("event_type" = 'message.status'),
  CONSTRAINT "whatsapp_status_webhook_events_fixture_check"
    CHECK ("fixture_version" = 'v1'),
  CONSTRAINT "whatsapp_status_webhook_events_signature_check"
    CHECK ("signature_valid"),
  CONSTRAINT "whatsapp_status_webhook_events_hashes_check" CHECK (
    "payload_hash" ~ '^[0-9a-f]{64}$'
    AND "provider_message_id_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "whatsapp_status_webhook_events_redacted_check" CHECK (
    jsonb_typeof("payload_redacted_json") = 'object'
    AND COALESCE("payload_redacted_json" ->> 'mode' = 'simulation', false)
    AND COALESCE("payload_redacted_json" ->> 'synthetic' = 'true', false)
    AND NOT ("payload_redacted_json" ? 'providerMessageId')
  ),
  CONSTRAINT "whatsapp_status_webhook_events_outcome_check" CHECK (
    (
      "outcome" = 'applied'
      AND "message_id" IS NOT NULL
      AND "rejection_reason" IS NULL
    ) OR (
      "outcome" = 'ignored'
      AND "rejection_reason" IS NOT NULL
    )
  ),
  CONSTRAINT "whatsapp_status_webhook_events_time_check"
    CHECK ("processed_at" >= "received_at")
);

ALTER TABLE "whatsapp_status_webhook_events"
  ADD CONSTRAINT "whatsapp_status_webhook_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_status_webhook_events"
  ADD CONSTRAINT "whatsapp_status_webhook_events_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id")
  REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_status_webhook_events"
  ADD CONSTRAINT "whatsapp_status_webhook_events_message_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "message_id")
  REFERENCES "whatsapp_messages"("organization_id", "store_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_status_webhook_events_store_external_key"
  ON "whatsapp_status_webhook_events"("store_id", "external_event_id");
CREATE UNIQUE INDEX "whatsapp_status_webhook_events_tenant_id_key"
  ON "whatsapp_status_webhook_events"("organization_id", "store_id", "id");
CREATE INDEX "whatsapp_status_webhook_events_tenant_outcome_idx"
  ON "whatsapp_status_webhook_events"("organization_id", "outcome", "received_at");
CREATE INDEX "whatsapp_status_webhook_events_message_occurred_idx"
  ON "whatsapp_status_webhook_events"("message_id", "occurred_at");
CREATE INDEX "whatsapp_status_webhook_events_payload_hash_idx"
  ON "whatsapp_status_webhook_events"("payload_hash");

CREATE TABLE "whatsapp_message_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "webhook_event_id" UUID NOT NULL,
  "from_status" "whatsapp_message_status" NOT NULL,
  "observed_status" "whatsapp_message_status" NOT NULL,
  "resulting_status" "whatsapp_message_status" NOT NULL,
  "applied" BOOLEAN NOT NULL,
  "reason_code" VARCHAR(80),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_message_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_message_status_history_result_check" CHECK (
    (
      "applied"
      AND "resulting_status" = "observed_status"
      AND "reason_code" IS NULL
    ) OR (
      NOT "applied"
      AND "resulting_status" = "from_status"
      AND "reason_code" IS NOT NULL
    )
  )
);

ALTER TABLE "whatsapp_message_status_history"
  ADD CONSTRAINT "whatsapp_message_status_history_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_message_status_history"
  ADD CONSTRAINT "whatsapp_message_status_history_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id")
  REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_message_status_history"
  ADD CONSTRAINT "whatsapp_message_status_history_message_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "message_id")
  REFERENCES "whatsapp_messages"("organization_id", "store_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_message_status_history"
  ADD CONSTRAINT "whatsapp_message_status_history_event_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "webhook_event_id")
  REFERENCES "whatsapp_status_webhook_events"("organization_id", "store_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_message_status_history_webhook_key"
  ON "whatsapp_message_status_history"("webhook_event_id");
CREATE UNIQUE INDEX "whatsapp_message_status_history_event_tenant_key"
  ON "whatsapp_message_status_history"("organization_id", "store_id", "webhook_event_id");
CREATE INDEX "whatsapp_message_status_history_message_created_idx"
  ON "whatsapp_message_status_history"("message_id", "created_at");
CREATE INDEX "whatsapp_message_status_history_tenant_applied_idx"
  ON "whatsapp_message_status_history"("organization_id", "applied", "created_at");

CREATE FUNCTION prevent_whatsapp_status_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'whatsapp status evidence is immutable' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "whatsapp_status_webhook_events_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_status_webhook_events"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_status_record_mutation();

CREATE TRIGGER "whatsapp_message_status_history_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_message_status_history"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_status_record_mutation();
