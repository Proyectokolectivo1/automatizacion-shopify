-- Durable inbound WhatsApp messages in explicit simulation mode only.
CREATE TYPE "whatsapp_inbound_identity_resolution" AS ENUM ('known_customer', 'unknown_contact');
CREATE TYPE "whatsapp_inbound_webhook_outcome" AS ENUM ('accepted', 'duplicate');

ALTER TABLE "whatsapp_conversations"
  ALTER COLUMN "customer_id" DROP NOT NULL,
  ALTER COLUMN "phone_e164" DROP NOT NULL,
  ADD COLUMN "contact_hash" CHAR(64);

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_identity_shape_check" CHECK (
    (
      "customer_id" IS NOT NULL
      AND "phone_e164" IS NOT NULL
      AND "phone_e164" ~ '^\+[1-9][0-9]{7,14}$'
    ) OR (
      "customer_id" IS NULL
      AND "phone_e164" IS NULL
      AND "contact_hash" ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX "whatsapp_conversations_store_contact_hash_key"
  ON "whatsapp_conversations"("store_id", "contact_hash");

ALTER TABLE "whatsapp_messages"
  DROP CONSTRAINT "whatsapp_messages_simulation_shape_check",
  ALTER COLUMN "order_id" DROP NOT NULL,
  ALTER COLUMN "template_id" DROP NOT NULL,
  ALTER COLUMN "body" DROP NOT NULL,
  ADD COLUMN "encrypted_body_json" JSONB,
  ADD COLUMN "content_fingerprint" CHAR(64),
  ADD COLUMN "sender_hash" CHAR(64),
  ADD COLUMN "received_at" TIMESTAMPTZ(3),
  ADD COLUMN "retention_expires_at" TIMESTAMPTZ(3);

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_simulation_shape_check" CHECK (
    "provider_message_id" ~ '^simulated:[0-9a-f]{32,64}$'
    AND "business_key_hash" ~ '^[0-9a-f]{64}$'
    AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("metadata_json") = 'object'
    AND COALESCE("metadata_json" ->> 'mode' = 'simulation', false)
    AND COALESCE("metadata_json" ->> 'fixtureVersion' = 'v1', false)
    AND (
      (
        "direction" = 'outbound'
        AND "type" = 'template'
        AND "order_id" IS NOT NULL
        AND "template_id" IS NOT NULL
        AND char_length("body") BETWEEN 1 AND 4096
        AND "encrypted_body_json" IS NULL
        AND "content_fingerprint" IS NULL
        AND "sender_hash" IS NULL
        AND "received_at" IS NULL
        AND "retention_expires_at" IS NULL
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
      ) OR (
        "direction" = 'inbound'
        AND "type" = 'text'
        AND "status" = 'simulated_received'
        AND "order_id" IS NULL
        AND "template_id" IS NULL
        AND "body" IS NULL
        AND jsonb_typeof("encrypted_body_json") = 'object'
        AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'authTag') = 'string', false)
        AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'ciphertext') = 'string', false)
        AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'iv') = 'string', false)
        AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'version') = 'string', false)
        AND "content_fingerprint" ~ '^[0-9a-f]{64}$'
        AND "sender_hash" ~ '^[0-9a-f]{64}$'
        AND "sent_at" IS NULL
        AND "delivered_at" IS NULL
        AND "read_at" IS NULL
        AND "failed_at" IS NULL
        AND "received_at" IS NOT NULL
        AND "retention_expires_at" > "received_at"
      )
    )
  );

CREATE OR REPLACE FUNCTION prevent_whatsapp_message_content_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.encrypted_body_json IS DISTINCT FROM OLD.encrypted_body_json
     OR NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
     OR NEW.sender_hash IS DISTINCT FROM OLD.sender_hash
     OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
     OR NEW.business_key_hash IS DISTINCT FROM OLD.business_key_hash
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.retention_expires_at IS DISTINCT FROM OLD.retention_expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'whatsapp message content is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "whatsapp_inbound_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "external_event_id" VARCHAR(128) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "fixture_version" VARCHAR(16) NOT NULL,
  "identity_resolution" "whatsapp_inbound_identity_resolution" NOT NULL,
  "outcome" "whatsapp_inbound_webhook_outcome" NOT NULL,
  "signature_valid" BOOLEAN NOT NULL DEFAULT true,
  "payload_hash" CHAR(64) NOT NULL,
  "provider_message_id_hash" CHAR(64) NOT NULL,
  "sender_hash" CHAR(64) NOT NULL,
  "payload_redacted_json" JSONB NOT NULL,
  "content_length" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "whatsapp_inbound_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_inbound_webhook_events_external_not_blank"
    CHECK (length(btrim("external_event_id")) > 0),
  CONSTRAINT "whatsapp_inbound_webhook_events_event_type_check"
    CHECK ("event_type" = 'message.received'),
  CONSTRAINT "whatsapp_inbound_webhook_events_fixture_check"
    CHECK ("fixture_version" = 'v1'),
  CONSTRAINT "whatsapp_inbound_webhook_events_signature_check"
    CHECK ("signature_valid"),
  CONSTRAINT "whatsapp_inbound_webhook_events_hashes_check" CHECK (
    "payload_hash" ~ '^[0-9a-f]{64}$'
    AND "provider_message_id_hash" ~ '^[0-9a-f]{64}$'
    AND "sender_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "whatsapp_inbound_webhook_events_redacted_check" CHECK (
    jsonb_typeof("payload_redacted_json") = 'object'
    AND COALESCE("payload_redacted_json" ->> 'mode' = 'simulation', false)
    AND COALESCE("payload_redacted_json" ->> 'synthetic' = 'true', false)
    AND NOT ("payload_redacted_json" ?| ARRAY['from', 'phone', 'senderPhoneE164', 'text', 'providerMessageId'])
  ),
  CONSTRAINT "whatsapp_inbound_webhook_events_content_length_check"
    CHECK ("content_length" BETWEEN 1 AND 4096),
  CONSTRAINT "whatsapp_inbound_webhook_events_time_check"
    CHECK ("processed_at" >= "received_at")
);

ALTER TABLE "whatsapp_inbound_webhook_events"
  ADD CONSTRAINT "whatsapp_inbound_webhook_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_inbound_webhook_events"
  ADD CONSTRAINT "whatsapp_inbound_webhook_events_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id")
  REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_inbound_webhook_events"
  ADD CONSTRAINT "whatsapp_inbound_webhook_events_conversation_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "conversation_id")
  REFERENCES "whatsapp_conversations"("organization_id", "store_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_inbound_webhook_events"
  ADD CONSTRAINT "whatsapp_inbound_webhook_events_message_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "message_id")
  REFERENCES "whatsapp_messages"("organization_id", "store_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_inbound_webhook_events_store_external_key"
  ON "whatsapp_inbound_webhook_events"("store_id", "external_event_id");
CREATE UNIQUE INDEX "whatsapp_inbound_webhook_events_tenant_id_key"
  ON "whatsapp_inbound_webhook_events"("organization_id", "store_id", "id");
CREATE INDEX "whatsapp_inbound_webhook_events_message_received_idx"
  ON "whatsapp_inbound_webhook_events"("message_id", "received_at");
CREATE INDEX "whatsapp_inbound_webhook_events_conversation_occurred_idx"
  ON "whatsapp_inbound_webhook_events"("conversation_id", "occurred_at");
CREATE INDEX "whatsapp_inbound_webhook_events_tenant_outcome_idx"
  ON "whatsapp_inbound_webhook_events"("organization_id", "outcome", "received_at");
CREATE INDEX "whatsapp_inbound_webhook_events_payload_hash_idx"
  ON "whatsapp_inbound_webhook_events"("payload_hash");

CREATE TRIGGER "whatsapp_inbound_webhook_events_immutable"
BEFORE UPDATE OR DELETE ON "whatsapp_inbound_webhook_events"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_status_record_mutation();
