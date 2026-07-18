ALTER TABLE "whatsapp_messages"
  ADD COLUMN "content_purged_at" TIMESTAMPTZ(3);

ALTER TABLE "whatsapp_messages"
  DROP CONSTRAINT "whatsapp_messages_simulation_shape_check";

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
        AND "content_purged_at" IS NULL
        AND "sender_hash" IS NULL
        AND "received_at" IS NULL
        AND "retention_expires_at" IS NULL
        AND (
          ("status" = 'simulated_accepted' AND "sent_at" IS NULL AND "delivered_at" IS NULL AND "read_at" IS NULL AND "failed_at" IS NULL)
          OR ("status" = 'simulated_sent' AND "sent_at" IS NOT NULL AND "delivered_at" IS NULL AND "read_at" IS NULL AND "failed_at" IS NULL)
          OR ("status" = 'simulated_delivered' AND "delivered_at" IS NOT NULL AND "read_at" IS NULL AND "failed_at" IS NULL)
          OR ("status" = 'simulated_read' AND "read_at" IS NOT NULL AND "failed_at" IS NULL)
          OR ("status" = 'simulated_failed' AND "failed_at" IS NOT NULL AND "delivered_at" IS NULL AND "read_at" IS NULL)
        )
      ) OR (
        "direction" = 'inbound'
        AND "type" = 'text'
        AND "status" = 'simulated_received'
        AND "order_id" IS NULL
        AND "template_id" IS NULL
        AND "body" IS NULL
        AND "sender_hash" ~ '^[0-9a-f]{64}$'
        AND "sent_at" IS NULL
        AND "delivered_at" IS NULL
        AND "read_at" IS NULL
        AND "failed_at" IS NULL
        AND "received_at" IS NOT NULL
        AND "retention_expires_at" > "received_at"
        AND (
          (
            jsonb_typeof("encrypted_body_json") = 'object'
            AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'authTag') = 'string', false)
            AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'ciphertext') = 'string', false)
            AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'iv') = 'string', false)
            AND COALESCE(jsonb_typeof("encrypted_body_json" -> 'version') = 'string', false)
            AND "content_fingerprint" ~ '^[0-9a-f]{64}$'
            AND "content_purged_at" IS NULL
          ) OR (
            "encrypted_body_json" IS NULL
            AND "content_fingerprint" IS NULL
            AND "content_purged_at" >= "retention_expires_at"
          )
        )
      )
    )
  );

CREATE INDEX "whatsapp_messages_expired_content_idx"
  ON "whatsapp_messages"("retention_expires_at", "id")
  WHERE "direction" = 'inbound' AND "encrypted_body_json" IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_whatsapp_message_content_mutation() RETURNS trigger AS $$
DECLARE
  valid_content_purge BOOLEAN;
BEGIN
  valid_content_purge :=
    OLD.direction = 'inbound'
    AND OLD.encrypted_body_json IS NOT NULL
    AND OLD.content_fingerprint IS NOT NULL
    AND OLD.content_purged_at IS NULL
    AND NEW.encrypted_body_json IS NULL
    AND NEW.content_fingerprint IS NULL
    AND NEW.content_purged_at IS NOT NULL
    AND NEW.content_purged_at >= OLD.retention_expires_at;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.sender_hash IS DISTINCT FROM OLD.sender_hash
     OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
     OR NEW.business_key_hash IS DISTINCT FROM OLD.business_key_hash
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.retention_expires_at IS DISTINCT FROM OLD.retention_expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (
       (
         NEW.encrypted_body_json IS DISTINCT FROM OLD.encrypted_body_json
         OR NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
         OR NEW.content_purged_at IS DISTINCT FROM OLD.content_purged_at
       )
       AND NOT valid_content_purge
     ) THEN
    RAISE EXCEPTION 'whatsapp message content is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
