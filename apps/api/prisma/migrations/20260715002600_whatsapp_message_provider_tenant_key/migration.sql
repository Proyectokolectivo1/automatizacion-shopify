-- Provider message identities are scoped to the receiving store.
DROP INDEX "whatsapp_messages_provider_message_key";

CREATE UNIQUE INDEX "whatsapp_messages_store_provider_message_key"
  ON "whatsapp_messages"("store_id", "provider_message_id");
