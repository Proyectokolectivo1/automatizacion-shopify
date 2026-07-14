-- Expand-only Shopify integration registry with tenant-safe ownership and encrypted credentials.
CREATE TYPE "integration_provider" AS ENUM (
  'shopify', 'wompi', 'mastershop', 'whatsapp', 'meta_ads', 'google_ads',
  'tiktok_ads', 'email', 'object_storage'
);
CREATE TYPE "integration_status" AS ENUM ('pending', 'tested', 'active', 'disabled', 'error');
CREATE TYPE "integration_health_status" AS ENUM ('unknown', 'healthy', 'unhealthy');

CREATE UNIQUE INDEX "stores_organization_id_id_key" ON "stores"("organization_id", "id");

CREATE TABLE "integration_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "provider" "integration_provider" NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "status" "integration_status" NOT NULL DEFAULT 'pending',
  "encrypted_credentials" JSONB NOT NULL,
  "config_json" JSONB NOT NULL DEFAULT '{}',
  "last_health_check_at" TIMESTAMPTZ(3),
  "last_health_status" "integration_health_status" NOT NULL DEFAULT 'unknown',
  "credential_rotated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integration_connections_display_name_not_blank"
    CHECK (length(btrim("display_name")) > 0),
  CONSTRAINT "integration_connections_credentials_envelope"
    CHECK (
      jsonb_typeof("encrypted_credentials") = 'object' AND
      jsonb_typeof("encrypted_credentials"->'version') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'iv') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'authTag') = 'string' AND
      jsonb_typeof("encrypted_credentials"->'ciphertext') = 'string'
    ),
  CONSTRAINT "integration_connections_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "integration_connections_store_tenant_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "integration_connections_store_provider_key"
  ON "integration_connections"("store_id", "provider");
CREATE INDEX "integration_connections_organization_provider_status_idx"
  ON "integration_connections"("organization_id", "provider", "status");
CREATE INDEX "integration_connections_health_idx"
  ON "integration_connections"("status", "last_health_check_at");
