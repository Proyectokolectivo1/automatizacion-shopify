-- Forward-only constraints for a tenant-safe simulated WhatsApp connection registry.
ALTER TABLE "integration_connections"
  ADD CONSTRAINT "integration_connections_whatsapp_config_shape"
    CHECK (
      "provider" <> 'whatsapp' OR (
        jsonb_typeof("config_json") = 'object' AND
        "config_json" ?& ARRAY['apiVersion', 'businessAccountId', 'fixtureVersion', 'mode', 'phoneNumberId'] AND
        jsonb_typeof("config_json"->'apiVersion') = 'string' AND
        jsonb_typeof("config_json"->'businessAccountId') = 'string' AND
        jsonb_typeof("config_json"->'fixtureVersion') = 'string' AND
        jsonb_typeof("config_json"->'mode') = 'string' AND
        jsonb_typeof("config_json"->'phoneNumberId') = 'string' AND
        "config_json"->>'apiVersion' ~ '^v[1-9][0-9]{0,2}[.][0-9]+$' AND
        "config_json"->>'businessAccountId' ~ '^[A-Za-z0-9_-]{3,128}$' AND
        "config_json"->>'fixtureVersion' ~ '^v[1-9][0-9]*$' AND
        "config_json"->>'mode' = 'simulation' AND
        "config_json"->>'phoneNumberId' ~ '^[A-Za-z0-9_-]{3,128}$'
      )
    );

CREATE UNIQUE INDEX "integration_connections_whatsapp_phone_number_key"
  ON "integration_connections" (("config_json"->>'phoneNumberId'))
  WHERE "provider" = 'whatsapp';
