-- Durable WhatsApp transactional messaging in explicit simulation mode only.
CREATE TYPE "whatsapp_conversation_status" AS ENUM ('open', 'closed');
CREATE TYPE "whatsapp_message_direction" AS ENUM ('outbound', 'inbound');
CREATE TYPE "whatsapp_message_type" AS ENUM ('template', 'text');
CREATE TYPE "whatsapp_message_status" AS ENUM ('simulated_accepted');

CREATE TABLE "whatsapp_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "phone_e164" VARCHAR(32) NOT NULL,
  "status" "whatsapp_conversation_status" NOT NULL DEFAULT 'open',
  "last_message_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_conversations_phone_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE "whatsapp_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "template_id" UUID NOT NULL,
  "direction" "whatsapp_message_direction" NOT NULL DEFAULT 'outbound',
  "provider_message_id" VARCHAR(160) NOT NULL,
  "type" "whatsapp_message_type" NOT NULL DEFAULT 'template',
  "status" "whatsapp_message_status" NOT NULL DEFAULT 'simulated_accepted',
  "body" VARCHAR(4096) NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "business_key_hash" CHAR(64) NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "sent_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "read_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_messages_simulation_shape_check" CHECK (
    "direction" = 'outbound'
    AND "type" = 'template'
    AND "status" = 'simulated_accepted'
    AND "provider_message_id" ~ '^simulated:[0-9a-f]{32,64}$'
    AND "business_key_hash" ~ '^[0-9a-f]{64}$'
    AND "request_fingerprint" ~ '^[0-9a-f]{64}$'
    AND char_length("body") BETWEEN 1 AND 4096
    AND jsonb_typeof("metadata_json") = 'object'
    AND COALESCE("metadata_json" ->> 'mode' = 'simulation', false)
    AND COALESCE("metadata_json" ->> 'fixtureVersion' = 'v1', false)
    AND "sent_at" IS NULL
    AND "delivered_at" IS NULL
    AND "read_at" IS NULL
    AND "failed_at" IS NULL
  )
);

ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customer_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "customer_id") REFERENCES "customers"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_conversations_store_phone_key" ON "whatsapp_conversations"("store_id", "phone_e164");
CREATE UNIQUE INDEX "whatsapp_conversations_tenant_id_key" ON "whatsapp_conversations"("organization_id", "store_id", "id");
CREATE INDEX "whatsapp_conversations_tenant_status_last_idx" ON "whatsapp_conversations"("organization_id", "status", "last_message_at");
CREATE INDEX "whatsapp_conversations_customer_last_idx" ON "whatsapp_conversations"("customer_id", "last_message_at");

ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_store_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "conversation_id") REFERENCES "whatsapp_conversations"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_order_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "order_id") REFERENCES "orders"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_template_tenant_fkey"
  FOREIGN KEY ("organization_id", "store_id", "template_id") REFERENCES "whatsapp_templates"("organization_id", "store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "whatsapp_messages_provider_message_key" ON "whatsapp_messages"("provider_message_id");
CREATE UNIQUE INDEX "whatsapp_messages_business_key_hash_key" ON "whatsapp_messages"("business_key_hash");
CREATE UNIQUE INDEX "whatsapp_messages_tenant_id_key" ON "whatsapp_messages"("organization_id", "store_id", "id");
CREATE INDEX "whatsapp_messages_conversation_created_idx" ON "whatsapp_messages"("conversation_id", "created_at");
CREATE INDEX "whatsapp_messages_order_created_idx" ON "whatsapp_messages"("order_id", "created_at");
CREATE INDEX "whatsapp_messages_tenant_status_created_idx" ON "whatsapp_messages"("organization_id", "status", "created_at");

CREATE FUNCTION prevent_whatsapp_message_content_mutation() RETURNS trigger AS $$
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
     OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
     OR NEW.business_key_hash IS DISTINCT FROM OLD.business_key_hash
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'whatsapp message content is immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "whatsapp_messages_immutable_content"
BEFORE UPDATE ON "whatsapp_messages"
FOR EACH ROW EXECUTE FUNCTION prevent_whatsapp_message_content_mutation();
